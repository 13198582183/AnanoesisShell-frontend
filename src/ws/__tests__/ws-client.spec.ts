import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WsChannel, createTerminalChannel } from '@/ws/ws-client'
import { isTerminalOutput } from '@/types'
import type { TerminalInput, TerminalOutput } from '@/types'

/**
 * WsChannel 单元测试
 * WHY: 契约（asyncapi.yaml）定义 /ws/terminal、/ws/approval、/ws/ai 三个独立 WebSocket 通道，
 *      而非 Wave 1 假设的"单连接按 type 字段多路复用"。WsChannel<TSend, TReceive>
 *      以泛型封装单通道的连接/收发/状态管理，供三类通道复用。
 */
describe('WsChannel', () => {
  let mockWs: MockWebSocket
  let originalWebSocket: typeof globalThis.WebSocket
  let originalLocation: Location

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket
    mockWs = new MockWebSocket()
    globalThis.WebSocket = vi.fn(() => mockWs) as unknown as typeof WebSocket
    // WHY: WsChannel 默认根据 window.location 拼接同源 ws(s)://host/path，
    //      交由 Vite dev proxy 转发到真实后端；测试环境下 jsdom 的 location
    //      默认为 http://localhost:3000，符合预期无需额外 stub。
    originalLocation = window.location
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  describe('连接管理', () => {
    it('connect() 依据 window.location 拼接同源 ws:// URL（走 Vite proxy）', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      channel.connect()

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)
      const [url] = (globalThis.WebSocket as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect(url).toBe(`ws://${window.location.host}/ws/terminal`)
    })

    it('options.baseUrl 可覆盖默认 URL 拼接（测试/特殊部署场景）', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput, {
        baseUrl: 'ws://example.test:9999',
      })
      channel.connect()

      const [url] = (globalThis.WebSocket as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect(url).toBe('ws://example.test:9999/ws/terminal')
    })

    it('连接成功后状态变为 connected，并通知状态监听器', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      const stateHandler = vi.fn()
      channel.onStateChange(stateHandler)

      channel.connect()
      expect(stateHandler).toHaveBeenCalledWith('connecting')

      mockWs.simulateOpen()
      expect(channel.state).toBe('connected')
      expect(stateHandler).toHaveBeenLastCalledWith('connected')
    })

    it('远端关闭连接后状态变为 disconnected', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      channel.connect()
      mockWs.simulateOpen()
      mockWs.simulateClose(1000, 'normal')

      expect(channel.state).toBe('disconnected')
    })

    it('disconnect() 主动关闭 WebSocket', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      channel.connect()
      mockWs.simulateOpen()
      channel.disconnect()

      expect(mockWs.closeCalled).toBe(true)
      expect(channel.state).toBe('disconnected')
    })

    it('重复调用 connect() 不会创建多个 WebSocket', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      channel.connect()
      channel.connect()

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)
    })
  })

  describe('消息收发', () => {
    it('send() 将载荷序列化为 JSON 发送（字段名保持 snake_case 原样）', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      channel.connect()
      mockWs.simulateOpen()

      const msg: TerminalInput = { action: 'open', host_id: 'host-1' }
      channel.send(msg)

      expect(mockWs.lastSentData).toBe(JSON.stringify(msg))
    })

    it('未连接时 send() 抛出错误', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)

      expect(() => channel.send({ action: 'input', session_id: 's', data: 'x' })).toThrow(
        'WebSocket is not connected',
      )
    })

    it('收到通过类型守卫校验的消息时触发 onMessage 监听器', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      const handler = vi.fn()
      channel.onMessage(handler)
      channel.connect()
      mockWs.simulateOpen()

      const msg: TerminalOutput = { type: 'data', session_id: 'sess-1', stream: 'stdout', data: 'hello\r\n' }
      mockWs.simulateMessage(JSON.stringify(msg))

      expect(handler).toHaveBeenCalledWith(msg)
    })

    it('收到未通过类型守卫校验的消息时忽略，不触发监听器', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      const handler = vi.fn()
      channel.onMessage(handler)
      channel.connect()
      mockWs.simulateOpen()

      mockWs.simulateMessage(JSON.stringify({ foo: 'bar' }))

      expect(handler).not.toHaveBeenCalled()
    })

    it('收到非法 JSON 时不崩溃，忽略该消息', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      const handler = vi.fn()
      channel.onMessage(handler)
      channel.connect()
      mockWs.simulateOpen()

      mockWs.simulateMessage('not-valid-json{{{')

      expect(handler).not.toHaveBeenCalled()
    })

    it('onMessage 返回的取消订阅函数生效', () => {
      const channel = new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput)
      const handler = vi.fn()
      const unsubscribe = channel.onMessage(handler)
      unsubscribe()
      channel.connect()
      mockWs.simulateOpen()

      mockWs.simulateMessage(JSON.stringify({ type: 'data', session_id: 'sess-1', data: 'x' }))

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('createTerminalChannel 工厂', () => {
    it('创建绑定 /ws/terminal 通道、以 isTerminalOutput 为守卫的 WsChannel', () => {
      const channel = createTerminalChannel()
      channel.connect()

      const [url] = (globalThis.WebSocket as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect(url).toBe(`ws://${window.location.host}/ws/terminal`)
    })
  })
})

/**
 * Mock WebSocket 实现
 * WHY: jsdom 不提供真实 WebSocket，需模拟其行为以测试封装逻辑
 */
class MockWebSocket {
  url = ''
  readyState = 0 // CONNECTING
  closeCalled = false
  lastSentData: string | null = null

  onopen: (() => void) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  send(data: string) {
    this.lastSentData = data
  }

  close() {
    this.closeCalled = true
    this.readyState = 3 // CLOSED
  }

  simulateOpen() {
    this.readyState = 1 // OPEN
    this.onopen?.()
  }

  simulateClose(code: number, reason: string) {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  simulateError() {
    this.onerror?.()
  }
}
