import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, reactive, nextTick } from 'vue'
import WorkspaceView from '@/views/WorkspaceView.vue'
import { useWorkspacesStore } from '@/stores/workspaces'

/**
 * WorkspaceView 组件测试（task 10.2 + OrcaTerm 重构）
 * WHY: 验证顶部 tab 条（roving tabindex，方向键导航）、
 *      中间 TerminalTimeline（含 SFTP 侧边栏）、底部模式切换条的组合布局。
 *      路由切换不销毁后台资源，tab 条键盘可访问。
 */

// 测试内可注入通道回调/终端写入 spy：hoisted 保证 vi.mock 工厂可引用
const mocks = vi.hoisted(() => ({
  writeSpy: vi.fn(),
  /** refit spy：断言会话采纳/回活等时机驱动了 winsize 强制同步（BUG-C） */
  refitSpy: vi.fn(),
  /** 按通道类型收集组件注册的 onMessage 回调，供用例模拟服务端帧 */
  channelHandlers: new Map<string, Array<(msg: unknown) => void>>(),
  /** 按通道类型收集创建的通道实例，供断言 send/connect 调用 */
  channels: new Map<string, Array<Record<string, unknown>>>(),
  /** 按通道类型收集 onStateChange 回调，供模拟 WS 层连接状态变化 */
  stateHandlers: new Map<string, Array<(state: string) => void>>(),
  /** 回合结束自动落位 ❯ 提示符的 spy（BUG-H：收尾不得把提示符留给下一次按键） */
  openPromptSpy: vi.fn(),
}))

// Mock 子组件，避免 xterm 真实初始化（per-tab 多实例架构：v-for 渲染，各自持有 sessionId）
vi.mock('@/components/terminal/TerminalTimeline.vue', () => ({
  default: {
    name: 'TerminalTimeline',
    template:
      '<div data-testid="terminal-timeline" :data-session="activeSessionId">TerminalTimeline</div>',
    props: ['activeSessionId', 'mode', 'disconnected', 'generating'],
    // 真实组件通过 defineExpose 暴露写入方法，mock 同步提供可断言的 spy；
    // 首参携带实例所属 sessionId，用于断言写入了哪个 tab 的缓冲区
    setup: (props: { activeSessionId: string }, ctx: { expose: (e: Record<string, unknown>) => void }) => {
      ctx.expose({
        writeToTerminal: (...args: unknown[]) => mocks.writeSpy(props.activeSessionId, ...args),
        scrollToBottom: vi.fn(),
        refit: mocks.refitSpy,
        openAgentPrompt: mocks.openPromptSpy,
      })
    },
  },
}))

// Mock WS 通道：隔离真实 WebSocket，同时把 onMessage 回调暴露给用例注入帧
vi.mock('@/ws', () => {
  const makeChannel = (kind: string) => {
    const channel = {
      state: 'connected',
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn(),
      onStateChange: (cb: (state: string) => void) => {
        const list = mocks.stateHandlers.get(kind) ?? []
        list.push(cb)
        mocks.stateHandlers.set(kind, list)
        return () => {}
      },
      onMessage: (cb: (msg: unknown) => void) => {
        const list = mocks.channelHandlers.get(kind) ?? []
        list.push(cb)
        mocks.channelHandlers.set(kind, list)
        return () => {}
      },
    }
    const list = mocks.channels.get(kind) ?? []
    list.push(channel as unknown as Record<string, unknown>)
    mocks.channels.set(kind, list)
    return channel
  }
  return {
    createTerminalChannel: () => makeChannel('term'),
    createAiChannel: () => makeChannel('ai'),
    createApprovalChannel: () => makeChannel('approval'),
  }
})

vi.mock('@/components/files/RemoteFilePanel.vue', () => ({
  default: {
    name: 'RemoteFilePanel',
    template: '<div data-testid="remote-file-panel">RemoteFilePanel</div>',
    props: ['sessionId', 'controlToken', 'initialPath'],
  },
}))

vi.mock('@/components/files/TransferQueue.vue', () => ({
  default: {
    name: 'TransferQueue',
    template: '<div data-testid="transfer-queue">TransferQueue</div>',
    props: ['transfers', 'sessionId', 'controlToken'],
  },
}))

// 审批浮动弹窗为纯展示组件（无待审批时不渲染），mock 隔离其倒计时定时器
vi.mock('@/components/ApprovalCard.vue', () => ({
  default: {
    name: 'ApprovalCard',
    template: '<div v-if="request" data-testid="approval-card">ApprovalCard</div>',
    props: ['request'],
  },
}))

const pushMock = vi.fn()
// WHY 响应式共享 routeMock：KeepAlive 切页场景中 route 参数会动态变化，
// 静态 mock 无法触发 computed 重算，测不出「离开路由后 watcher 回退登记」的污染
const routeMock = reactive({ params: { workspaceId: 'ws-test-1' } as Record<string, string | undefined> })
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
    useRoute: () => routeMock,
  }
})

describe('WorkspaceView.vue', () => {
  beforeEach(() => {
    // WHY: workspaces store 持久化到 localStorage，残留数据会使 tab 数量/ID 跨用例耦合
    localStorage.clear()
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mocks.channelHandlers.clear()
    mocks.channels.clear()
    mocks.stateHandlers.clear()
    // 共享 routeMock 跨用例复位，防止上一用例改过 params 造成串扰
    routeMock.params.workspaceId = 'ws-test-1'
  })

  it('渲染顶部 tab 条', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    expect(wrapper.find('[data-region="tab-bar"]').exists()).toBe(true)
  })

  it('tab 条展示所有 workspace 实例', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    const tabs = wrapper.findAll('[data-role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toContain('Server A')
    expect(tabs[1].text()).toContain('Server B')
  })

  it('tab 条键盘可访问——有 roving tabindex', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    const tabs = wrapper.findAll('[data-role="tab"]')
    // roving tabindex: 活动 tab（第一个，因为路由参数不匹配时回退到第一个）tabindex=0，非活动 tabindex=-1
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
  })

  it('中间区域渲染 TerminalTimeline', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    expect(wrapper.find('[data-testid="terminal-timeline"]').exists()).toBe(true)
  })

  it('底部区域渲染模式切换条', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    // 模式切换按钮应该存在
    const modeBtns = wrapper.findAll('.mode-btn')
    expect(modeBtns.length).toBeGreaterThanOrEqual(2)
    expect(modeBtns[0].text()).toContain('Shell')
    expect(modeBtns[1].text()).toContain('Agent')
  })

  it('点击 tab 触发路由跳转到对应 workspace', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    const tabs = wrapper.findAll('[data-role="tab"]')
    await tabs[1].trigger('click')

    // 点击第二个 tab 应触发路由跳转到 ws2 的 ID
    expect(pushMock).toHaveBeenCalledWith(`/workspace/${ws2.id}`)
  })

  it('tab 条有关闭按钮', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, {
      global: { plugins: [pinia] },
    })

    expect(wrapper.find('[data-action="close-tab"]').exists()).toBe(true)
  })

  // ============ 多开入口与最后激活 tab 登记（导航 bug 修复） ============

  it('tab 栏有"+"多开按钮：点击后以当前激活 tab 的主机新建 workspace 并跳转', async () => {
    // WHY：连接按钮改为复用已有 tab 后，同主机多开的入口移到 tab 栏"+"
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    await wrapper.find('[data-action="new-tab"]').trigger('click')
    await flushPromises()

    const list = store.listAll()
    expect(list).toHaveLength(2)
    const created = list[1]
    expect(created.hostId).toBe('host-1')
    expect(created.hostName).toBe('Server A')
    expect(pushMock).toHaveBeenCalledWith(`/workspace/${created.id}`)
    expect(ws1.id).not.toBe(created.id)
  })

  it('挂载时把当前激活 tab 登记为 lastActiveId（供侧栏 workspace 入口回跳）', async () => {
    // WHY：用户离开 workspace 后侧栏需要知道回到哪个 tab；路由参数不匹配时
    // effectiveActiveId 回退到首个 tab，登记的应是实际展示的那个
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(store.lastActiveId).toBe(ws1.id)
  })

  it('离开 workspace 路由（KeepAlive 切页）不得覆盖 lastActiveId', async () => {
    // WHY：实测偏差 —— ws-2 活跃时切到设置页，route 参数变 undefined，
    // effectiveActiveId 回退到首个 tab，watcher 把 ws-1 登记进去，
    // 侧栏回跳就被污染到 ws-1；登记必须以「当前停在 workspace 路由」为前提
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    routeMock.params.workspaceId = ws2.id
    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(store.lastActiveId).toBe(ws2.id)

    // 模拟 KeepAlive 切页：路由离开后参数为空，视图未销毁、watcher 仍活跃
    routeMock.params.workspaceId = undefined
    await nextTick()
    await flushPromises()
    expect(store.lastActiveId).toBe(ws2.id)
  })

  // ============ 多 tab 串台回归（广播通道的 conversation 归属过滤） ============

  /** 构造一条审批请求帧（字段对齐 asyncapi ApprovalRequest） */
  function approvalFrame(approvalId: string, conversationId: string) {
    return {
      approval_id: approvalId,
      conversation_id: conversationId,
      host_id: 'host-1',
      tool_name: 'run_command',
      tool_params: { command: 'echo hi' },
      ai_analysis: '测试',
      command: 'echo hi',
      version: 1,
      timeout_seconds: 120,
    }
  }

  it('审批归属过滤：非本 tab 会话的审批不弹窗不加分；本 tab 会话的才入队', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-mine')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    const deliver = (msg: unknown) => {
      for (const cb of mocks.channelHandlers.get('approval') ?? []) cb(msg)
    }

    // 后台 tab 的审批广播到本通道：必须被过滤（串台 bug 回归）
    deliver(approvalFrame('appr-foreign', 'conv-other'))
    await flushPromises()
    expect(wrapper.find('[data-testid="approval-card"]').exists()).toBe(false)
    expect(store.getById(ws.id)!.pendingApprovals).toBe(0)

    // 本 tab 会话的审批：正常弹窗 + 徽章 +1
    deliver(approvalFrame('appr-mine', 'conv-mine'))
    await flushPromises()
    expect(wrapper.find('[data-testid="approval-card"]').exists()).toBe(true)
    expect(store.getById(ws.id)!.pendingApprovals).toBe(1)
  })

  it('AI 流归属过滤：非本 tab 会话的帧不写入终端，本 tab 的才写', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-mine')

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    const deliver = (msg: unknown) => {
      for (const cb of mocks.channelHandlers.get('ai') ?? []) cb(msg)
    }

    // 无关会话的 error 帧：被过滤，不写终端
    deliver({ type: 'error', conversation_id: 'conv-other', message: '外部错误' })
    await flushPromises()
    expect(mocks.writeSpy).not.toHaveBeenCalled()

    // 本 tab 会话的 error 帧：写入 [AI 错误]（首参为实例 sessionId，文本在第二参）
    deliver({ type: 'error', conversation_id: 'conv-mine', message: '本会话错误' })
    await flushPromises()
    expect(mocks.writeSpy).toHaveBeenCalledTimes(1)
    expect(String(mocks.writeSpy.mock.calls[0][1])).toContain('[AI 错误] 本会话错误')
  })

  it('后台 tab 隔离回归：写入路由到所属 tab 自己的终端实例，不污染激活 tab', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })
    // 两个 tab 都已建立会话：ws1 激活，ws2 在后台
    store.setSessionId(ws1.id, 'sess-1')
    store.setSessionId(ws2.id, 'sess-2')
    store.setConversationId(ws1.id, 'conv-1')
    store.setConversationId(ws2.id, 'conv-2')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // per-tab 架构：两个 tab 各持有一个独立终端实例（v-show 切换，非共享单例）
    const timelines = wrapper.findAll('[data-testid="terminal-timeline"]')
    expect(timelines).toHaveLength(2)

    // 后台 tab（ws2）的审批到达：留痕必须写进 ws2 自己的实例（sessionId=sess-2），
    // 而不是激活 tab 的终端——共享单实例时代此写入会随切 tab reset 丢失
    const deliverApproval = (msg: unknown) => {
      for (const cb of mocks.channelHandlers.get('approval') ?? []) cb(msg)
    }
    deliverApproval(approvalFrame('appr-bg', 'conv-2'))
    await flushPromises()

    const bgWrites = mocks.writeSpy.mock.calls.filter(c => c[0] === 'sess-2')
    expect(bgWrites.length).toBe(1)
    expect(String(bgWrites[0][1])).toContain('⏳待审批')
    // 激活 tab（ws1）的终端没有被后台审批污染
    expect(mocks.writeSpy.mock.calls.every(c => c[0] !== 'sess-1')).toBe(true)
    // 后台 tab 只加徽章不弹窗（弹窗只展示激活 tab 队首）
    expect(wrapper.find('[data-testid="approval-card"]').exists()).toBe(false)
    expect(store.getById(ws2.id)!.pendingApprovals).toBe(1)
  })

  // ============ 断线重连（closed 帧终态 + 重连入口 + 新会话采纳） ============

  /** 向 term 通道注入服务端帧 */
  const deliverTerm = (msg: unknown) => {
    for (const cb of mocks.channelHandlers.get('term') ?? []) cb(msg)
  }

  it('closed 帧：状态转 closed、sessionId 清空并展示重连提示与按钮', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 先建立会话：open 回执帧（type=data, data=""）
    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    await flushPromises()
    expect(store.getById(ws.id)!.sessionId).toBe('sess-old')
    expect(store.getById(ws.id)!.status).toBe('connected')

    // 服务端结束会话（如空闲回收）：下发 closed 帧
    deliverTerm({ type: 'closed', session_id: 'sess-old', end_reason: 'timeout' })
    await flushPromises()

    // 状态转终态；sessionId 必须清空——残留旧 id 会让输入继续往死会话发，
    // 后端逐帧回“终端会话不存在”造成错误风暴（浏览器实测 152 行）
    expect(store.getById(ws.id)!.status).toBe('closed')
    expect(store.getById(ws.id)!.sessionId).toBeNull()
    // 重连按钮出现 + 终端内写入重连指引（含按 r 提示）
    expect(wrapper.find('[data-action="reconnect"]').exists()).toBe(true)
    const lastWrite = String(mocks.writeSpy.mock.calls[mocks.writeSpy.mock.calls.length - 1][1])
    expect(lastWrite).toContain('重连')
    expect(lastWrite).toContain('r')
  })

  it('点击重连按钮：重新发送 open 且新 session_id 被采纳（回归：旧会话残留阻挡新 id）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 建立会话后断开（closed）
    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    deliverTerm({ type: 'closed', session_id: 'sess-old', end_reason: 'timeout' })
    await flushPromises()

    // 点击重连：通道仍连接（仅后端会话结束）→ 直接再发 open
    await wrapper.find('[data-action="reconnect"]').trigger('click')
    const termChannel = mocks.channels.get('term')![0] as { send: ReturnType<typeof vi.fn> }
    expect(termChannel.send).toHaveBeenCalledWith({ action: 'open', host_id: 'host-1' })

    // 新会话回执：新 id 必须覆盖已采纳过的旧 id（恒更新修复点）
    deliverTerm({ type: 'data', session_id: 'sess-new', stream: 'stdout', data: '' })
    await flushPromises()
    expect(store.getById(ws.id)!.sessionId).toBe('sess-new')
    expect(store.getById(ws.id)!.status).toBe('connected')
    // 重连成功后按钮消失
    expect(wrapper.find('[data-action="reconnect"]').exists()).toBe(false)
  })

  it('重连时重置该 tab 的 Agent 对话记忆：conversationId 清空并写边界注记（新会话是全新 shell，旧记忆与实况不一致）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 建立会话并产生 Agent 对话（conversation 绑定到 tab）
    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    store.setConversationId(ws.id, 'conv-old')
    // 后端回收会话 → 断线终态
    deliverTerm({ type: 'closed', session_id: 'sess-old', end_reason: 'timeout' })
    await flushPromises()
    expect(store.getById(ws.id)!.conversationId).toBe('conv-old')

    // 点击重连：新终端会话 = 全新 shell，旧对话记忆（cwd/已做操作）与实况脱节，必须重置
    await wrapper.find('[data-action="reconnect"]').trigger('click')
    await flushPromises()
    expect(store.getById(ws.id)!.conversationId).toBeNull()
    // 边界注记：向用户明示 Agent 上下文已重置（对标断线提示行）
    const writes = mocks.writeSpy.mock.calls.map(c => String(c[1])).join('')
    expect(writes).toContain('Agent')
    expect(writes).toContain('重置')
  })

  it('重连时先经 AI 通道发 stop_turn 打断旧对话在飞回合再解绑（后端任务必须随重连终结，不阻塞新会话）', async () => {
    // WHY：用户实测——重连后旧回合仍在后端执行（inFlight 未释放），
    // 后续提问被 ERR_BUSY「本会话正在处理上一条提问」拒绝。重连即用户
    // 显式放弃旧回合，必须复用 Ctrl+C 停止链路（stop_turn → 后端 interrupt
    // + 审批失效 + 终止命令执行），而非只解绑前端记忆
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 建立会话、产生 Agent 对话并断线
    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    store.setConversationId(ws.id, 'conv-old')
    deliverTerm({ type: 'closed', session_id: 'sess-old', end_reason: 'timeout' })
    await flushPromises()

    await wrapper.find('[data-action="reconnect"]').trigger('click')
    await flushPromises()

    // 解绑前必须先发 stop_turn 上行：后端据此中断旧对话在飞回合并关闭任务执行
    const aiChannel = mocks.channels.get('ai')![0] as { send: ReturnType<typeof vi.fn> }
    expect(aiChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stop_turn', conversation_id: 'conv-old' }),
    )
    // 且解绑仍正常完成（停回合不阻断记忆重置）
    expect(store.getById(ws.id)!.conversationId).toBeNull()
  })

  it('重连时连带重建 AI 与审批通道：整条 WS 断开后 Agent 提问不得因「AI 通道未连接」静默丢弃', async () => {
    // WHY：浏览器实测——后端重启后三条通道全死，旧重连链路只重建终端通道，
    // ai/approval 通道无自动重连，重连后 Agent 提问被 sendAiMessage 的
    // 「AI 通道未连接」分支静默丢弃，新会话实际仍不可用
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 建立会话后整条链路断开（failed 终态，重连按钮出现）
    deliverTerm({ type: 'data', session_id: 'sess-x', stream: 'stdout', data: '' })
    deliverTerm({ type: 'closed', session_id: 'sess-x', end_reason: 'timeout' })
    await flushPromises()

    // 模拟后端重启：AI/审批通道已断开（真实 WsChannel 断开后不会自动重连）
    const aiChannel = mocks.channels.get('ai')![0] as {
      state: string
      connect: ReturnType<typeof vi.fn>
    }
    const approvalChannel = mocks.channels.get('approval')![0] as {
      state: string
      connect: ReturnType<typeof vi.fn>
    }
    aiChannel.state = 'disconnected'
    approvalChannel.state = 'disconnected'
    aiChannel.connect.mockClear()
    approvalChannel.connect.mockClear()

    await wrapper.find('[data-action="reconnect"]').trigger('click')
    await flushPromises()

    // 重连必须把 AI/审批通道一并拉起（真实 connect 对已连接幂等，无条件调用安全）
    expect(aiChannel.connect).toHaveBeenCalled()
    expect(approvalChannel.connect).toHaveBeenCalled()
  })

  it('整条 WS 断开后重连：stop_turn 延迟到 AI 通道恢复连接后仍要送达旧对话', async () => {
    // WHY：用户路径复现——Agent 长任务在飞时整条连接断开（网络抖动/vite 重启），
    // 重连瞬间 aiChannel 还是 disconnected，立即发 stop_turn 会 no-op；
    // 后端 inFlight 仍被旧回合占用、审批卡残留。必须挂状态回调，通道连上后补发
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 建立会话+对话后断线
    deliverTerm({ type: 'data', session_id: 'sess-d', stream: 'stdout', data: '' })
    store.setConversationId(ws.id, 'conv-stale')
    deliverTerm({ type: 'closed', session_id: 'sess-d', end_reason: 'timeout' })
    await flushPromises()

    // 模拟整条 WS 断开：AI 通道已断（后端重启/刷新场景不同：这里后端存活、旧回合仍在飞）
    const aiChannel = mocks.channels.get('ai')![0] as {
      state: string
      send: ReturnType<typeof vi.fn>
    }
    aiChannel.state = 'disconnected'
    aiChannel.send.mockClear()

    await wrapper.find('[data-action="reconnect"]').trigger('click')
    await flushPromises()

    // 断开状态下不发帧（send 会抛），但通道恢复后必须补发 stop_turn 给旧对话
    const aiStateCbs = mocks.stateHandlers.get('ai') ?? []
    for (const cb of aiStateCbs) cb('connected')
    await flushPromises()
    expect(aiChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stop_turn', conversation_id: 'conv-stale' }),
    )
    // 解绑仍正常完成
    expect(store.getById(ws.id)!.conversationId).toBeNull()
  })

  it('首连（非重连）不触发记忆重置注记：仅显式重连才清空 conversation', async () => {
    // 重连是用户显式重建会话的动作才重置；正常首连无旧记忆，不应出现重置注记噪音
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()
    mocks.writeSpy.mockClear()
    deliverTerm({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '' })
    await flushPromises()
    const writes = mocks.writeSpy.mock.calls.map(c => String(c[1])).join('')
    expect(writes).not.toContain('重置')
  })

  it('WS 层断开时通道未连接：重连走 connect()，建连后自动补发 open', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 会话建立后 WS 层整体断开（后端进程退出）：无 closed 帧，只有 onclose 状态回调
    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    await flushPromises()
    for (const cb of mocks.stateHandlers.get('term') ?? []) cb('disconnected')
    await flushPromises()

    // WS 断开终态：sessionId 清空（防输入路由到死会话）+ failed 状态 + 断开提示
    expect(store.getById(store.listAll()[0].id)!.sessionId).toBeNull()
    expect(store.getById(store.listAll()[0].id)!.status).toBe('failed')
    const lastWrite = String(mocks.writeSpy.mock.calls[mocks.writeSpy.mock.calls.length - 1][1])
    expect(lastWrite).toContain('连接已断开')

    const termChannel = mocks.channels.get('term')![0] as {
      state: string
      send: ReturnType<typeof vi.fn>
      connect: ReturnType<typeof vi.fn>
    }
    termChannel.state = 'disconnected'
    termChannel.send.mockClear()

    // 点击重连：通道未连接 → 重建连接（onStateChange connected 后自动发 open）
    await wrapper.find('[data-action="reconnect"]').trigger('click')
    expect(termChannel.connect).toHaveBeenCalled()
    expect(termChannel.send).not.toHaveBeenCalled()
  })

  // ============ winsize 同步（BUG-C：远端 PTY 停留 80x24，方向键调历史重绘全乱） ============

  it('会话采纳时触发 refit 强制同步 winsize（首连/重连同一路径）', async () => {
    // WHY: 后端 PTY 固定按 80x24 分配，前端必须在会话就绪后把真实列数
    //      发过去；不同步则 readline 按 80 列算换行，本地宽屏下历史调出全乱
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()
    mocks.refitSpy.mockClear()

    // open 回执携带 session_id → 会话被采纳 → 必须驱动一次 refit 补发尺寸
    deliverTerm({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '' })
    await flushPromises()
    await nextTick()
    expect(mocks.refitSpy).toHaveBeenCalled()
  })

  it('时间线 emit resize → 已连接会话时向终端通道发 resize 帧', async () => {
    // 锁定链路：组件上报尺寸 → 父级翻译成协议 resize 帧（通道未就绪时被守卫丢弃）
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()
    deliverTerm({ type: 'data', session_id: 'sess-r', stream: 'stdout', data: '' })
    await flushPromises()

    const termChannel = mocks.channels.get('term')![0] as { send: ReturnType<typeof vi.fn> }
    termChannel.send.mockClear()
    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    timeline.vm.$emit('resize', 132, 43)
    expect(termChannel.send).toHaveBeenCalledWith({
      action: 'resize',
      session_id: 'sess-r',
      cols: 132,
      rows: 43,
    })
  })

  it('TerminalTimeline 上按 r 触发的 reconnect 事件与按钮同路径：重发 open', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    deliverTerm({ type: 'data', session_id: 'sess-old', stream: 'stdout', data: '' })
    deliverTerm({ type: 'closed', session_id: 'sess-old', end_reason: 'timeout' })
    await flushPromises()

    // 断线态下时间线实例应收到 disconnected=true（驱动 r 键拦截）
    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    expect(timeline.props('disconnected')).toBe(true)

    // 组件 emit reconnect → 与按钮同一重连路径
    timeline.vm.$emit('reconnect')
    await flushPromises()
    const termChannel = mocks.channels.get('term')![0] as { send: ReturnType<typeof vi.fn> }
    expect(termChannel.send).toHaveBeenCalledWith({ action: 'open', host_id: 'host-1' })
    expect(store.getById(ws.id)!.status).toBe('connecting')
  })

  it('Ctrl+C 触发时间线 agentStop 后经 AI 通道发 stop_turn 帧打断在飞回合', async () => {
    // WHY：用户反馈——Agent 对话要能像 Shell 一样 Ctrl+C 打断；
    // 前端只翻协议（stop_turn 上行），真正的中断清算在后端 AiAgentService.stop
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-stop-1')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    timeline.vm.$emit('agentStop')
    await flushPromises()

    const aiChannel = mocks.channels.get('ai')![0] as { send: ReturnType<typeof vi.fn> }
    expect(aiChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stop_turn', conversation_id: 'conv-stop-1' }),
    )
  })

  it('stop_turn 发出后本地立即闭环：清生成态并写停止注记行', async () => {
    // WHY：run9 实测——interrupt() 可能把后端 WS 发送链一并打断（连接 1006），
    // 后端收尾帧不保证送达；停止的用户感知必须由前端本地闭环，
    // 后端若送达 final 也只幂等复位（双份注记行可接受，丢帧不可接受）
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-stop-2')
    // agentInput 链路仅对 Agent 模式生效（handleAgentInput 准入检查 ws.mode）
    store.setMode(ws.id, 'agent')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 构造生成中状态：走真实发送链路（sendAiMessage 点亮流式标志）
    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    timeline.vm.$emit('agentInput', '讲讲启动流程')
    await flushPromises()
    // generating 随流式标志联动传给时间线（驱动 Ctrl+C 升级为打断）
    expect(timeline.props('generating')).toBe(true)

    timeline.vm.$emit('agentStop')
    await flushPromises()

    // 本地立即复位：生成态不再卡住
    expect(timeline.props('generating')).toBe(false)
    // 终端可见停止注记行（不依赖后端收尾帧送达）
    const writes = mocks.writeSpy.mock.calls.map(c => String(c[1])).join('')
    expect(writes).toContain('已被用户停止')
  })

  // ============ 回合结束自动落位 ❯ 提示符（BUG-H） ============

  it('Agent 模式 final 帧后自动落位提示符（回答完成/取消终结/轮次上限共用路径）', async () => {
    // WHY: 用户实测——AI 结束对话后需敲一次键盘 ❯ 才出现、光标才落位；
    //      取消终结/轮次上限也走 finishWithNote+final，故单触点覆盖全部终结路径
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-prompt-1')
    store.setMode(ws.id, 'agent')

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    for (const cb of mocks.channelHandlers.get('ai') ?? []) {
      cb({ type: 'answer_delta', conversation_id: 'conv-prompt-1', content: '当前目录 /root' })
    }
    await flushPromises()
    expect(mocks.openPromptSpy).not.toHaveBeenCalled()

    for (const cb of mocks.channelHandlers.get('ai') ?? []) {
      cb({ type: 'final', conversation_id: 'conv-prompt-1', message_id: 'm-1' })
    }
    await flushPromises()
    expect(mocks.openPromptSpy).toHaveBeenCalled()
  })

  it('Agent 模式 error 帧后也落位提示符（异常收尾同样回到可输入态）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-prompt-2')
    store.setMode(ws.id, 'agent')

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    for (const cb of mocks.channelHandlers.get('ai') ?? []) {
      cb({ type: 'error', conversation_id: 'conv-prompt-2', message: '模型出错' })
    }
    await flushPromises()
    expect(mocks.openPromptSpy).toHaveBeenCalled()
  })

  it('Shell 模式 final 帧不落位 Agent 提示符（输入行仅属 Agent 模式）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-prompt-3')
    // 默认 Shell 模式：回合收尾不应在 PTY 输入流里打 ❯

    mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    for (const cb of mocks.channelHandlers.get('ai') ?? []) {
      cb({ type: 'final', conversation_id: 'conv-prompt-3', message_id: 'm-1' })
    }
    await flushPromises()
    expect(mocks.openPromptSpy).not.toHaveBeenCalled()
  })

  it('Ctrl+C 本地闭环停回合后也落位提示符（停完即可继续输入）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-prompt-4')
    store.setMode(ws.id, 'agent')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    timeline.vm.$emit('agentInput', '长任务')
    await flushPromises()
    timeline.vm.$emit('agentStop')
    await flushPromises()
    expect(mocks.openPromptSpy).toHaveBeenCalled()
  })

  it('断线重连重置对话记忆后落位提示符（重置注记写完即可输入）', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setConversationId(ws.id, 'conv-prompt-5')
    store.setMode(ws.id, 'agent')

    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } })
    await flushPromises()

    // 先断线进入终态，再触发重连（与重连按钮同路径）
    deliverTerm({ type: 'data', session_id: 'sess-p5', stream: 'stdout', data: '' })
    deliverTerm({ type: 'closed', session_id: 'sess-p5', end_reason: 'timeout' })
    await flushPromises()

    const timeline = wrapper.findComponent({ name: 'TerminalTimeline' })
    timeline.vm.$emit('reconnect')
    await flushPromises()

    const writes = mocks.writeSpy.mock.calls.map(c => String(c[1])).join('')
    expect(writes).toContain('对话记忆已重置')
    expect(mocks.openPromptSpy).toHaveBeenCalled()
  })
})

describe('WorkspaceView KeepAlive 兼容', () => {
  it('组件声明 name 为 "WorkspaceView"（KeepAlive include 匹配前提）', () => {
    // WHY: App 壳用 <KeepAlive :include="['WorkspaceView']"> 缓存工作区，
    // 切页不断连接不丢终端历史（spec「后台连接继续工作」）；
    // include 按 name 匹配，未声明 name 的组件永远不会命中缓存
    expect((WorkspaceView as unknown as { name?: string }).name).toBe('WorkspaceView')
  })
})
