import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConversationHistory from '@/components/ConversationHistory.vue'
import { conversationsApi } from '@/api'
import type { Conversation, MessageListResponse, Message } from '@/api'

/**
 * WHY: mock 生成的 API 客户端，避免测试发真实 HTTP 请求。
 *      组件通过 props 接收 workspaceId/sessionId 等上下文，
 *      测试通过改变 props 模拟快速切换场景。
 */
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    conversationsApi: {
      listConversations: vi.fn(),
      listConversationMessages: vi.fn(),
      deleteConversation: vi.fn(),
      batchDeleteConversations: vi.fn(),
    },
  }
})

const mockApi = conversationsApi as unknown as {
  listConversations: ReturnType<typeof vi.fn>
  listConversationMessages: ReturnType<typeof vi.fn>
  deleteConversation: ReturnType<typeof vi.fn>
  batchDeleteConversations: ReturnType<typeof vi.fn>
}

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    sessionId: 'session-1',
    title: '测试对话',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    seq: 1,
    role: 'user',
    content: '你好',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeMsgListResponse(
  items: Message[],
  hasMore: boolean,
  nextCursor: string | null,
): MessageListResponse {
  return { items, hasMore, nextCursor }
}

describe('ConversationHistory.vue', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // 默认返回空列表
    mockApi.listConversations.mockResolvedValue([])
  })

  // ─── 11.1 基础列表与分页 ───

  it('挂载时加载对话列表并渲染', async () => {
    const convs = [makeConv({ id: 'c1', title: '对话 A' }), makeConv({ id: 'c2', title: '对话 B' })]
    mockApi.listConversations.mockResolvedValue(convs)

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    expect(mockApi.listConversations).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('对话 A')
    expect(wrapper.text()).toContain('对话 B')
  })

  it('点击对话项后加载消息并展示', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])
    const msgs = makeMsgListResponse([makeMsg({ id: 'm1', content: '你好世界' })], false, null)
    mockApi.listConversationMessages.mockResolvedValue(msgs)

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    expect(mockApi.listConversationMessages).toHaveBeenCalledWith({
      id: 'c1',
      cursor: undefined,
      limit: 30,
    })
    expect(wrapper.text()).toContain('你好世界')
  })

  it('"加载更多"使用 nextCursor 请求下一页并保序追加', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])

    const page1 = makeMsgListResponse(
      [makeMsg({ id: 'm1', seq: 1, content: '第一条' })],
      true,
      'cursor-page2',
    )
    const page2 = makeMsgListResponse(
      [makeMsg({ id: 'm2', seq: 2, content: '第二条' })],
      false,
      null,
    )
    mockApi.listConversationMessages
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-action="load-more"]').trigger('click')
    await flushPromises()

    expect(mockApi.listConversationMessages).toHaveBeenLastCalledWith({
      id: 'c1',
      cursor: 'cursor-page2',
      limit: 30,
    })
    // 保序：第一条在前，第二条在后
    const msgEls = wrapper.findAll('[data-message]')
    expect(msgEls).toHaveLength(2)
    expect(msgEls[0].text()).toContain('第一条')
    expect(msgEls[1].text()).toContain('第二条')
  })

  it('快速切换对话时，晚到的第一页响应不污染当前选中对话的消息列表', async () => {
    const conv1 = makeConv({ id: 'c1', title: '对话 A' })
    const conv2 = makeConv({ id: 'c2', title: '对话 B' })
    mockApi.listConversations.mockResolvedValue([conv1, conv2])

    // 模拟 c1 的响应延迟：先点击 c2（立即返回），c1 的响应后到
    let resolveC1!: (v: MessageListResponse) => void
    const c1Promise = new Promise<MessageListResponse>((resolve) => { resolveC1 = resolve })
    const c2Response = makeMsgListResponse([makeMsg({ id: 'm2', content: '对话B消息' })], false, null)

    mockApi.listConversationMessages
      .mockReturnValueOnce(c1Promise) // c1 的请求挂起
      .mockResolvedValueOnce(c2Response) // c2 的请求立即返回

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    // 先点击 c1（请求挂起）
    await wrapper.find('[data-conversation="c1"]').trigger('click')
    // 立即切换到 c2（请求立即返回）
    await wrapper.find('[data-conversation="c2"]').trigger('click')
    await flushPromises()

    // 此时应显示 c2 的消息
    expect(wrapper.text()).toContain('对话B消息')

    // c1 的迟响应到达
    resolveC1(makeMsgListResponse([makeMsg({ id: 'm1', content: '对话A消息' })], false, null))
    await flushPromises()

    // 消息列表不应被 c1 的迟响应污染
    expect(wrapper.text()).not.toContain('对话A消息')
    expect(wrapper.text()).toContain('对话B消息')
  })

  it('readOnly 模式下不显示删除/继续操作按钮', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: null, readOnly: true },
    })
    await flushPromises()

    expect(wrapper.find('[data-action="delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="continue"]').exists()).toBe(false)
  })

  it('消息展示 tool_calls 和 source 标识', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])

    const msgs = makeMsgListResponse([
      makeMsg({
        id: 'm1',
        role: 'assistant',
        content: '调用工具',
        toolCalls: [{ toolName: 'bash', toolParams: { cmd: 'ls' }, resultStatus: 'success', result: 'file.txt' }],
        source: 'agent',
        runId: 'run-1',
      }),
    ], false, null)
    mockApi.listConversationMessages.mockResolvedValue(msgs)

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('bash')
    expect(wrapper.text()).toContain('agent')
  })

  // ─── 11.2 历史操作 ───

  it('点击"继续此对话"emit continue 事件', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A', sessionId: 'session-1' })
    mockApi.listConversations.mockResolvedValue([conv])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-action="continue"]').trigger('click')
    expect(wrapper.emitted('continue')).toBeTruthy()
    expect(wrapper.emitted('continue')![0]).toEqual(['c1'])
  })

  it('单删对话需确认，确认后调用 deleteConversation', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])
    mockApi.deleteConversation.mockResolvedValue(undefined)
    // 删除后重新加载列表
    mockApi.listConversations.mockResolvedValueOnce([conv]).mockResolvedValueOnce([])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    // WHY: 需先选中一个对话，使 activeConvId 有值，删除按钮才会出现
    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    // 点击删除按钮
    await wrapper.find('[data-action="delete"]').trigger('click')
    // 确认对话框应出现
    expect(wrapper.find('[data-confirm-dialog]').exists()).toBe(true)

    // 确认删除
    await wrapper.find('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(mockApi.deleteConversation).toHaveBeenCalledWith({ id: 'c1' })
  })

  it('删除返回 409 时显示"请先停止运行中任务"提示', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])
    mockApi.deleteConversation.mockRejectedValue(new Error('409 Conflict'))

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    // WHY: 需先选中一个对话
    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-action="delete"]').trigger('click')
    await wrapper.find('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('请先停止运行中任务')
  })

  it('批删最多 100 个，调用 batchDeleteConversations', async () => {
    const convs = Array.from({ length: 5 }, (_, i) =>
      makeConv({ id: `c${i}`, title: `对话 ${i}` }),
    )
    mockApi.listConversations.mockResolvedValue(convs)
    mockApi.batchDeleteConversations.mockResolvedValue(undefined)
    mockApi.listConversations.mockResolvedValueOnce(convs).mockResolvedValueOnce([])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    // 选中多个
    const checkboxes = wrapper.findAll('[data-select]')
    for (const cb of checkboxes) {
      await cb.trigger('change')
    }

    await wrapper.find('[data-action="batch-delete"]').trigger('click')
    await wrapper.find('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(mockApi.batchDeleteConversations).toHaveBeenCalledWith({
      batchDeleteRequest: { ids: expect.arrayContaining(['c0', 'c1', 'c2', 'c3', 'c4']) },
    })
  })

  it('删除当前查看的对话后回到空白状态，不自动发问', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    const msgs = makeMsgListResponse([makeMsg({ id: 'm1', content: '具体消息内容XYZ' })], false, null)
    mockApi.listConversations.mockResolvedValue([conv])
    mockApi.listConversationMessages.mockResolvedValue(msgs)
    mockApi.deleteConversation.mockResolvedValue(undefined)
    // 删除后列表为空
    mockApi.listConversations.mockResolvedValueOnce([conv]).mockResolvedValueOnce([])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('具体消息内容XYZ')

    await wrapper.find('[data-action="delete"]').trigger('click')
    await wrapper.find('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    // WHY: 不应再显示已删除的具体消息内容
    expect(wrapper.text()).not.toContain('具体消息内容XYZ')
    // 不应有自动发问行为（没有 emit send/input 类事件）
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('已删除的记录不被旧响应复活', async () => {
    const conv = makeConv({ id: 'c1', title: '对话 A' })
    mockApi.listConversations.mockResolvedValue([conv])
    mockApi.deleteConversation.mockResolvedValue(undefined)
    mockApi.listConversations.mockResolvedValueOnce([conv]).mockResolvedValueOnce([])

    const wrapper = mount(ConversationHistory, {
      props: { sessionId: 'session-1', readOnly: false },
    })
    await flushPromises()

    // WHY: 需先选中一个对话
    await wrapper.find('[data-conversation="c1"]').trigger('click')
    await flushPromises()

    // 删除对话
    await wrapper.find('[data-action="delete"]').trigger('click')
    await wrapper.find('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    // 对话列表不应再包含已删除项
    expect(wrapper.text()).not.toContain('对话 A')
  })
})
