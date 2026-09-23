import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import AiChatView from '@/views/AiChatView.vue'
import { conversationsApi, hostsApi } from '@/api'
import type { Conversation, Message } from '@/api'

/**
 * AiChatView 组件测试（task 9.6）
 * WHY: 验证 AI 对话面板与 WS /ws/ai 通道及 ConversationsApi 的桥接——
 * user_message 提交（Q2 裁定：用户提问经 ai_stream(type=user_message) 发送）、
 * thinking_delta/answer_delta 分区流式渲染（model-provider「思考与非思考双模式」「流式响应」）、
 * tool_call/tool_result 可视化（ai-agent「操作透明性」，Q8 裁定：只读 auto=true 与
 * 副作用 auto=false+approval_id 均须展示）、error(api_key_missing) 提示与跳转设置
 * （credential-store「未配置 api key 即使用 AI」）、会话创建与历史加载（多轮上下文延续）。
 */

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    conversationsApi: {
      listConversations: vi.fn(),
      createConversation: vi.fn(),
      listConversationMessages: vi.fn(),
    },
    hostsApi: {
      listHosts: vi.fn(),
    },
  }
})

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const mockConversationsApi = conversationsApi as unknown as {
  listConversations: ReturnType<typeof vi.fn>
  createConversation: ReturnType<typeof vi.fn>
  listConversationMessages: ReturnType<typeof vi.fn>
}
const mockHostsApi = hostsApi as unknown as {
  listHosts: ReturnType<typeof vi.fn>
}

const conversation1: Conversation = {
  id: 'conv-1',
  title: '历史会话',
  hostId: 'host-1',
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
}

/** 历史消息样例：覆盖 Message.thinkingContent/content/toolCalls（含 rejected="用户已拒绝"） */
const historyMessages: Message[] = [
  {
    id: 'm1',
    conversationId: 'conv-1',
    role: 'user',
    content: '看看磁盘占用',
    createdAt: new Date('2026-09-20T10:00:01Z'),
  },
  {
    id: 'm2',
    conversationId: 'conv-1',
    role: 'assistant',
    content: '磁盘占用 85%，建议清理日志。',
    thinkingContent: '用户想查磁盘，先调用只读工具收集信息。',
    toolCalls: [
      { toolName: 'system_info', toolParams: {}, resultStatus: 'success', result: 'kernel 5.10' },
      {
        toolName: 'run_command',
        toolParams: { command: 'df -h' },
        resultStatus: 'rejected',
        result: '用户已拒绝',
        approvalId: 'ap-9',
      },
    ],
    createdAt: new Date('2026-09-20T10:00:02Z'),
  },
]

/** V2 API MessageListResponse 结构：{ items, nextCursor, hasMore } */
function msgListResponse(items: Message[]) {
  return { items, nextCursor: null, hasMore: false }
}

describe('AiChatView.vue', () => {
  let mockWs: MockWebSocket
  let originalWebSocket: typeof globalThis.WebSocket

  /** 模拟服务器经 /ws/ai 通道下发 ai_stream 消息 */
  function serverSend(payload: unknown): void {
    mockWs.simulateMessage(JSON.stringify(payload))
  }

  /** 取出 WebSocket 已发送的全部消息（解析为对象） */
  function sentMessages(): Record<string, unknown>[] {
    return mockWs.allSentData.map((raw) => JSON.parse(raw))
  }

  function mountView() {
    return mount(AiChatView, { global: { plugins: [createPinia()] } })
  }

  /** 挂载并完成 WS 连接握手 */
  async function mountConnected() {
    const wrapper = mountView()
    await flushPromises()
    mockWs.simulateOpen()
    await flushPromises()
    return wrapper
  }

  /** 在输入框填入文本并点击发送 */
  async function typeAndSend(wrapper: ReturnType<typeof mountView>, text: string) {
    await wrapper.find('[data-field="input"]').setValue(text)
    await wrapper.find('[data-action="send"]').trigger('click')
    await flushPromises()
  }

  beforeEach(() => {
    // WHY: resetAllMocks 必须在安装 WebSocket 构造器 mock 之前执行，
    // 否则会清掉 vi.fn(() => mockWs) 的实现，new WebSocket() 将返回空对象而非 mockWs。
    vi.resetAllMocks()
    originalWebSocket = globalThis.WebSocket
    mockWs = new MockWebSocket()
    globalThis.WebSocket = vi.fn(() => mockWs) as unknown as typeof WebSocket
    mockConversationsApi.listConversations.mockResolvedValue([])
    // WHY: V2 API 返回 MessageListResponse（{ items, nextCursor, hasMore }），不是裸数组
    mockConversationsApi.listConversationMessages.mockResolvedValue(msgListResponse([]))
    mockConversationsApi.createConversation.mockResolvedValue({
      id: 'conv-new',
      createdAt: new Date(),
    })
    mockHostsApi.listHosts.mockResolvedValue([
      { id: 'host-1', host: '10.0.0.1', port: 22, username: 'root', authType: 'password' },
    ])
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  // ---------------- 连接与会话/历史 ----------------

  it('挂载后连接 /ws/ai 通道并拉取会话列表与主机列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(globalThis.WebSocket).toHaveBeenCalledWith(`ws://${window.location.host}/ws/ai`)
    expect(mockConversationsApi.listConversations).toHaveBeenCalledTimes(1)
    expect(mockHostsApi.listHosts).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('存在历史会话时自动选中最近会话并渲染历史消息（含思考过程与"用户已拒绝"）', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    mockConversationsApi.listConversationMessages.mockResolvedValue(msgListResponse(historyMessages))
    const wrapper = mountView()
    await flushPromises()

    expect(mockConversationsApi.listConversationMessages).toHaveBeenCalledWith({ id: 'conv-1' })
    const text = wrapper.text()
    expect(text).toContain('看看磁盘占用')
    expect(text).toContain('磁盘占用 85%')
    expect(text).toContain('用户想查磁盘')
    expect(text).toContain('system_info')
    expect(text).toContain('用户已拒绝')
    wrapper.unmount()
  })

  // ---------------- user_message 提交（Q2 裁定） ----------------

  it('无会话时首次提问先创建会话，再发送 ai_stream(type=user_message)', async () => {
    const wrapper = await mountConnected()

    await wrapper.find('[data-field="host"]').setValue('host-1')
    await typeAndSend(wrapper, '检查 nginx 状态')

    expect(mockConversationsApi.createConversation).toHaveBeenCalledWith({
      conversationCreate: { hostId: 'host-1' },
    })
    expect(sentMessages()).toContainEqual({
      type: 'user_message',
      conversation_id: 'conv-new',
      content: '检查 nginx 状态',
      host_id: 'host-1',
    })
    // 用户消息立即本地回显
    expect(wrapper.text()).toContain('检查 nginx 状态')
    wrapper.unmount()
  })

  it('未选择主机时 user_message 不携带 host_id（Q7 裁定：会话主机可选）', async () => {
    const wrapper = await mountConnected()

    await typeAndSend(wrapper, '你好')

    const sent = sentMessages()
    expect(sent.length).toBe(1)
    expect(sent[0]).toEqual({ type: 'user_message', conversation_id: 'conv-new', content: '你好' })
    expect('host_id' in sent[0]).toBe(false)
    wrapper.unmount()
  })

  it('多轮对话在同一会话内延续：第二次提问复用 conversation_id，不再创建会话', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    await typeAndSend(wrapper, '第一轮提问')
    // 真实协议流：上一回合以 final 结束后才能继续提问
    serverSend({ type: 'final', conversation_id: 'conv-1', finish_reason: 'stop' })
    await flushPromises()
    await typeAndSend(wrapper, '第二轮追问')

    expect(mockConversationsApi.createConversation).not.toHaveBeenCalled()
    expect(sentMessages()).toEqual([
      { type: 'user_message', conversation_id: 'conv-1', content: '第一轮提问' },
      { type: 'user_message', conversation_id: 'conv-1', content: '第二轮追问' },
    ])
    wrapper.unmount()
  })

  it('/ws/ai 通道未连接时提交不创建会话，并提示通道未连接', async () => {
    const wrapper = mountView()
    await flushPromises()

    await typeAndSend(wrapper, '检查服务')

    expect(mockConversationsApi.createConversation).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('AI 通道未连接')
    wrapper.unmount()
  })

  it('忽略非当前会话的 ai_stream 消息（多会话防串扰）', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({ type: 'answer_delta', conversation_id: 'other-conv', content: '别的会话内容' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('别的会话内容')
    wrapper.unmount()
  })

  // ---------------- 流式渲染：thinking / answer 分区 ----------------

  it('thinking_delta 渲染到可折叠思考区，answer_delta 逐块追加到回答区，二者视觉分区', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({ type: 'thinking_delta', conversation_id: 'conv-1', segment: 'thinking', content: '先分析磁盘' })
    serverSend({ type: 'thinking_delta', conversation_id: 'conv-1', segment: 'thinking', content: '占用原因。' })
    serverSend({ type: 'answer_delta', conversation_id: 'conv-1', segment: 'answer', content: '结论：日志过大' })
    serverSend({ type: 'answer_delta', conversation_id: 'conv-1', segment: 'answer', content: '，建议清理。' })
    await flushPromises()

    const thinking = wrapper.find('[data-region="thinking"]')
    const answer = wrapper.find('[data-region="answer"]')
    expect(thinking.exists()).toBe(true)
    expect(thinking.text()).toContain('先分析磁盘占用原因。')
    expect(answer.text()).toContain('结论：日志过大，建议清理。')
    // 分区隔离：思考内容不混入最终回答
    expect(answer.text()).not.toContain('先分析磁盘')
    wrapper.unmount()
  })

  // ---------------- 工具调用可视化（Q8 裁定） ----------------

  it('tool_call(auto=true) 展示工具名/参数/自动执行标识', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'list_dir', tool_params: { path: '/var/log' }, auto: true },
    })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('list_dir')
    expect(text).toContain('/var/log')
    expect(text).toContain('自动执行')
    wrapper.unmount()
  })

  it('tool_call(auto=false) 展示「等待审批」并关联 approval_id', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: {
        tool_name: 'run_command',
        tool_params: { command: 'systemctl restart nginx' },
        auto: false,
        approval_id: 'ap-2',
      },
    })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('run_command')
    expect(text).toContain('systemctl restart nginx')
    expect(text).toContain('等待审批')
    expect(text).toContain('ap-2')
    wrapper.unmount()
  })

  it('tool_result(success) 将结果文本回填到对应工具调用条目', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'system_info', tool_params: {}, auto: true },
    })
    serverSend({
      type: 'tool_result',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'system_info', result_status: 'success', result: 'kernel 5.10' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('kernel 5.10')
    wrapper.unmount()
  })

  it('tool_result(rejected) 展示「用户已拒绝」', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: {
        tool_name: 'run_command',
        tool_params: { command: 'rm -rf /tmp/x' },
        auto: false,
        approval_id: 'ap-3',
      },
    })
    serverSend({
      type: 'tool_result',
      conversation_id: 'conv-1',
      tool_call: {
        tool_name: 'run_command',
        approval_id: 'ap-3',
        result_status: 'rejected',
        result: '用户已拒绝',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('用户已拒绝')
    expect(wrapper.text()).not.toContain('等待审批')
    wrapper.unmount()
  })

  it('tool_result(execution_timeout/output_truncated) 分别展示「执行超时」「输出已截断」', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'run_command', tool_params: { command: 'sleep 999' }, auto: false, approval_id: 'ap-4' },
    })
    serverSend({
      type: 'tool_result',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'run_command', approval_id: 'ap-4', result_status: 'execution_timeout', result: null },
    })
    serverSend({
      type: 'tool_call',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'read_file', tool_params: { path: '/var/log/big.log' }, auto: true },
    })
    serverSend({
      type: 'tool_result',
      conversation_id: 'conv-1',
      tool_call: { tool_name: 'read_file', result_status: 'output_truncated', result: '前 1000 行...' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('执行超时')
    expect(wrapper.text()).toContain('输出已截断')
    wrapper.unmount()
  })

  // ---------------- 错误与结束 ----------------

  it('error(api_key_missing) 提示「请先在设置中配置模型 api key」，点击跳转设置页', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    serverSend({
      type: 'error',
      conversation_id: 'conv-1',
      error_code: 'api_key_missing',
      message: '请先在设置中配置模型 api key',
    })
    await flushPromises()

    expect(wrapper.text()).toContain('请先在设置中配置模型 api key')

    await wrapper.find('[data-action="goto-settings"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/settings')
    wrapper.unmount()
  })

  it('提问后进入流式状态禁用发送，收到 final 后恢复可继续提问', async () => {
    mockConversationsApi.listConversations.mockResolvedValue([conversation1])
    const wrapper = await mountConnected()

    await typeAndSend(wrapper, '分析一下负载')
    const sendBtn = wrapper.find('[data-action="send"]')
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(true)

    serverSend({ type: 'final', conversation_id: 'conv-1', finish_reason: 'stop' })
    await flushPromises()

    expect((wrapper.find('[data-action="send"]').element as HTMLButtonElement).disabled).toBe(false)
    wrapper.unmount()
  })
})

/**
 * Mock WebSocket（与 TerminalView.spec.ts 一致），记录所有发送过的消息
 */
class MockWebSocket {
  url = ''
  readyState = 0
  closeCalled = false
  lastSentData: string | null = null
  allSentData: string[] = []

  onopen: (() => void) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  send(data: string) {
    this.lastSentData = data
    this.allSentData.push(data)
  }

  close() {
    this.closeCalled = true
    this.readyState = 3
  }

  simulateOpen() {
    this.readyState = 1
    this.onopen?.()
  }

  simulateClose(code: number, reason: string) {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }
}
