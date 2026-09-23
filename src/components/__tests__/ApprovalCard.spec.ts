import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ApprovalCard from '@/components/ApprovalCard.vue'
import { ApprovalDecision, type ApprovalRequest } from '@/types'

/**
 * ApprovalCard 组件测试（浮动弹窗·纯展示重构后）
 * WHY: 组件不再自持 /ws/approval 连接（旧实现与 WorkspaceView 审批通道重复订阅，
 *      导致「同一审批弹两次 + 空命令卡片」）。现契约收窄为：
 *      - props 接收当前待审批 request，request 为 null 时不渲染；
 *      - 用户决策以 decide 事件回传（含 expectedVersion，design D5）；
 *      - 倒计时归零只 emit timeout，MUST NOT 伪造决策（超时以服务端为准）；
 *      - 连接与回送由父级（WorkspaceView）经单一 /approval 通道完成。
 */

/** 契约要求的审批请求样例（字段对齐 asyncapi.yaml ApprovalRequest；V2 含 version） */
function makeRequest(
  overrides: Omit<Partial<ApprovalRequest>, 'version'> & { version?: number } = {},
): ApprovalRequest {
  return {
    approval_id: 'ap-1',
    conversation_id: 'conv-1',
    host_id: 'host-1',
    host_label: 'root@10.0.0.1:22',
    tool_name: 'run_command',
    tool_params: { command: 'systemctl restart nginx' },
    command: 'systemctl restart nginx',
    ai_analysis: 'nginx 配置校验通过，需要重启使新配置生效，影响面为 Web 服务短暂中断。',
    timeout_seconds: 30,
    version: 1,
    ...overrides,
  }
}

function mountCard(request: ApprovalRequest | null) {
  return mount(ApprovalCard, { props: { request } })
}

describe('ApprovalCard.vue（纯展示弹窗）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('request 为 null 时不渲染卡片', () => {
    const wrapper = mountCard(null)
    expect(wrapper.find('[data-region="approval-card"]').exists()).toBe(false)
  })

  it('有 request 时展示 AI 分析、待执行命令与目标服务器', () => {
    const wrapper = mountCard(makeRequest())
    const card = wrapper.find('[data-region="approval-card"]')
    expect(card.exists()).toBe(true)
    expect(wrapper.text()).toContain('nginx 配置校验通过')
    expect(wrapper.text()).toContain('systemctl restart nginx')
    expect(wrapper.text()).toContain('root@10.0.0.1:22')
  })

  it('command 便捷字段缺失时从 tool_params.command 提取', () => {
    const req = makeRequest()
    delete req.command
    const wrapper = mountCard(req)
    expect(wrapper.find('[data-field="command"]').text()).toBe('systemctl restart nginx')
  })

  it('host_label 缺失时回退展示 host_id', () => {
    const req = makeRequest()
    delete req.host_label
    const wrapper = mountCard(req)
    expect(wrapper.find('[data-field="hostLabel"]').text()).toBe('host-1')
  })

  it('点击「执行」emit decide(approve) 且携带 expectedVersion', async () => {
    const wrapper = mountCard(makeRequest({ version: 3 }))
    await wrapper.find('[data-action="approve"]').trigger('click')

    expect(wrapper.emitted('decide')).toEqual([
      [{ approvalId: 'ap-1', decision: ApprovalDecision.Approve, expectedVersion: 3 }],
    ])
  })

  it('点击「取消」emit decide(cancel)', async () => {
    const wrapper = mountCard(makeRequest())
    await wrapper.find('[data-action="cancel"]').trigger('click')

    expect(wrapper.emitted('decide')).toEqual([
      [{ approvalId: 'ap-1', decision: ApprovalDecision.Cancel, expectedVersion: 1 }],
    ])
  })

  it('修改流程：进入编辑态 → 改写命令 → 确认修改 emit decide(modify) 并回到待决策态', async () => {
    const wrapper = mountCard(makeRequest())
    await wrapper.find('[data-action="modify"]').trigger('click')

    // 进入 modifying 态：命令变为可编辑输入框，预填原命令
    const input = wrapper.find('[data-field="modifiedCommand"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('systemctl restart nginx')

    await input.setValue('systemctl reload nginx')
    await wrapper.find('[data-action="confirm-modify"]').trigger('click')

    expect(wrapper.emitted('decide')).toEqual([
      [
        {
          approvalId: 'ap-1',
          decision: ApprovalDecision.Modify,
          modifiedCommand: 'systemctl reload nginx',
          expectedVersion: 1,
        },
      ],
    ])
    // WHY: 后端 modify 不重新广播——卡片必须回到 pending 态继续等待用户点「执行」，
    //      否则审批挂到超时（父级会就地更新 request 快照展示新命令）
    expect(wrapper.find('[data-action="approve"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="modifiedCommand"]').exists()).toBe(false)
  })

  it('修改流程：空命令不允许确认（不 emit）', async () => {
    const wrapper = mountCard(makeRequest())
    await wrapper.find('[data-action="modify"]').trigger('click')
    await wrapper.find('[data-field="modifiedCommand"]').setValue('   ')
    await wrapper.find('[data-action="confirm-modify"]').trigger('click')
    expect(wrapper.emitted('decide')).toBeUndefined()
  })

  it('修改流程：返回按钮回到待决策态', async () => {
    const wrapper = mountCard(makeRequest())
    await wrapper.find('[data-action="modify"]').trigger('click')
    await wrapper.find('[data-action="cancel-modify"]').trigger('click')
    expect(wrapper.find('[data-action="approve"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="modifiedCommand"]').exists()).toBe(false)
  })

  it('展示 timeout_seconds 倒计时并随时间递减', async () => {
    const wrapper = mountCard(makeRequest({ timeout_seconds: 30 }))
    expect(wrapper.find('[data-field="countdown"]').text()).toContain('30')

    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()
    expect(wrapper.find('[data-field="countdown"]').text()).toContain('25')
  })

  it('倒计时归零 emit timeout 且不 emit 任何决策（超时以服务端为准）', async () => {
    const wrapper = mountCard(makeRequest({ timeout_seconds: 3 }))
    await vi.advanceTimersByTimeAsync(3000)
    await nextTick()

    expect(wrapper.emitted('timeout')).toEqual([['ap-1']])
    expect(wrapper.emitted('decide')).toBeUndefined()
  })

  it('timeout_seconds 缺失时不展示倒计时且不自动超时', async () => {
    const wrapper = mountCard(makeRequest({ timeout_seconds: null }))
    expect(wrapper.find('[data-field="countdown"]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(120_000)
    expect(wrapper.emitted('timeout')).toBeUndefined()
    expect(wrapper.find('[data-region="approval-card"]').exists()).toBe(true)
  })

  it('request 切换（下一条待审批）时重置交互态并重启倒计时', async () => {
    const wrapper = mountCard(makeRequest({ approval_id: 'ap-1', timeout_seconds: 30 }))
    // 进入修改态后切换请求，应回到 pending 态
    await wrapper.find('[data-action="modify"]').trigger('click')
    await wrapper.setProps({ request: makeRequest({ approval_id: 'ap-2', timeout_seconds: 10 }) })
    await nextTick()

    expect(wrapper.find('[data-action="approve"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="countdown"]').text()).toContain('10')
  })
})
