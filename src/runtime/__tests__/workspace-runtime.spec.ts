import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkspaceRuntime, type RuntimeEvent } from '@/runtime/workspace-runtime'

/**
 * WorkspaceRuntime 测试（task 10.6）
 * WHY: 验证 WS 连接管理、事件订阅、resize 同步、资源释放等核心运行时行为。
 *      Runtime 是终端视图与 WS 通道之间的桥梁，隔离 xterm/WS 细节。
 */

// Mock WsChannel
const mockSend = vi.fn()
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockOnMessage = vi.fn()
const mockOnStateChange = vi.fn()

vi.mock('@/ws', () => ({
  createTerminalChannel: () => ({
    send: mockSend,
    connect: mockConnect,
    disconnect: mockDisconnect,
    onMessage: mockOnMessage,
    onStateChange: mockOnStateChange,
    state: 'disconnected' as string,
  }),
}))

describe('WorkspaceRuntime', () => {
  let runtime: WorkspaceRuntime

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    mockOnMessage.mockReturnValue(vi.fn())
    mockOnStateChange.mockReturnValue(vi.fn())
    runtime = new WorkspaceRuntime({
      sessionId: 'session-1',
      controlToken: 'token-abc',
    })
  })

  afterEach(() => {
    runtime.dispose()
    vi.useRealTimers()
  })

  it('connect 后发送 bind 帧提交 control_token', () => {
    runtime.connect()

    expect(mockConnect).toHaveBeenCalledTimes(1)
    // 当 WS 连接成功时，应发送 bind 帧
    // 模拟 state change 到 connected
    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')

    expect(mockSend).toHaveBeenCalledWith({
      action: 'bind',
      session_id: 'session-1',
      control_token: 'token-abc',
    })
  })

  it('subscribe 注册事件监听器，收到 terminal_output data 时触发回调', () => {
    const handler = vi.fn()
    runtime.subscribe(handler)
    runtime.connect()

    // 模拟 WS 连接后收到数据
    const msgHandler = mockOnMessage.mock.calls[0][0]
    msgHandler({
      type: 'data',
      session_id: 'session-1',
      event_seq: 1,
      data: 'hello\r\n',
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({
      type: 'data',
      sessionId: 'session-1',
      eventSeq: 1,
      data: 'hello\r\n',
    })
  })

  it('unsubscribe 后不再收到事件', () => {
    const handler = vi.fn()
    const unsub = runtime.subscribe(handler)
    runtime.connect()

    unsub()

    const msgHandler = mockOnMessage.mock.calls[0][0]
    msgHandler({
      type: 'data',
      session_id: 'session-1',
      event_seq: 1,
      data: 'hello',
    })

    expect(handler).not.toHaveBeenCalled()
  })

  it('sendInput 发送 terminal input 帧', () => {
    runtime.connect()
    // 模拟已连接
    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')

    runtime.sendInput('ls -la\r')

    expect(mockSend).toHaveBeenCalledWith({
      action: 'input',
      session_id: 'session-1',
      data: 'ls -la\r',
    })
  })

  it('sendResize 发送 resize 帧', () => {
    runtime.connect()
    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')

    runtime.sendResize(120, 40)

    expect(mockSend).toHaveBeenCalledWith({
      action: 'resize',
      session_id: 'session-1',
      cols: 120,
      rows: 40,
    })
  })

  it('隐藏实例不发零尺寸 resize', () => {
    runtime.connect()
    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')

    runtime.sendResize(0, 0)

    // 零尺寸不应发送
    const resizeCalls = mockSend.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).action === 'resize'
    )
    expect(resizeCalls).toHaveLength(0)
  })

  it('dispose 释放所有资源——断开 WS、清除监听器', () => {
    const unsubMock = vi.fn()
    mockOnMessage.mockReturnValue(unsubMock)
    const stateUnsubMock = vi.fn()
    mockOnStateChange.mockReturnValue(stateUnsubMock)

    runtime.connect()
    runtime.dispose()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(unsubMock).toHaveBeenCalledTimes(1)
    expect(stateUnsubMock).toHaveBeenCalledTimes(1)
  })

  it('快照去重——相同 event_seq 不重复触发', () => {
    const handler = vi.fn()
    runtime.subscribe(handler)
    runtime.connect()

    const msgHandler = mockOnMessage.mock.calls[0][0]
    msgHandler({ type: 'data', session_id: 'session-1', event_seq: 5, data: 'a' })
    msgHandler({ type: 'data', session_id: 'session-1', event_seq: 5, data: 'a' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('closeSession 发送 close 帧并断开', () => {
    runtime.connect()
    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')

    runtime.closeSession()

    expect(mockSend).toHaveBeenCalledWith({
      action: 'close',
      session_id: 'session-1',
    })
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('connectionState 反映当前连接状态', () => {
    expect(runtime.connectionState).toBe('disconnected')

    runtime.connect()
    expect(runtime.connectionState).toBe('connecting')

    const stateHandler = mockOnStateChange.mock.calls[0][0]
    stateHandler('connected')
    expect(runtime.connectionState).toBe('connected')

    stateHandler('disconnected')
    expect(runtime.connectionState).toBe('disconnected')
  })
})
