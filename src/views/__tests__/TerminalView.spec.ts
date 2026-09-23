import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import TerminalView from '@/views/TerminalView.vue'

/**
 * WHY: xterm.js 依赖真实浏览器的 canvas/DOM 渲染能力，jsdom 环境无法完整支持，
 * 故 mock Terminal/FitAddon 类，聚焦验证 WebSocket 桥接逻辑（open/input/close 握手、
 * terminal_output 分发、Ctrl-C 控制字节透传），而非终端像素级渲染本身。
 */
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    static instances: MockTerminal[] = []
    dataHandlers: ((data: string) => void)[] = []
    written: string[] = []
    disposed = false

    constructor() {
      MockTerminal.instances.push(this)
    }
    onData(cb: (data: string) => void) {
      this.dataHandlers.push(cb)
      return { dispose: vi.fn() }
    }
    open(_el: HTMLElement) {
      /* noop */
    }
    write(data: string) {
      this.written.push(data)
    }
    loadAddon(_addon: unknown) {
      /* noop */
    }
    dispose() {
      this.disposed = true
    }
  }
  return { Terminal: MockTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    static instances: MockFitAddon[] = []
    fitCalls = 0
    constructor() {
      MockFitAddon.instances.push(this)
    }
    fit() {
      this.fitCalls++
    }
    activate() {
      /* noop */
    }
    dispose() {
      /* noop */
    }
  }
  return { FitAddon: MockFitAddon }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { hostId: 'host-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

// WHY: TerminalView 现在集成了 Agent 模式，须 mock 额外的依赖
vi.mock('@/api', () => ({
  conversationsApi: {
    listConversations: vi.fn().mockResolvedValue([]),
    listConversationMessages: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue({ id: 'conv-new' }),
  },
}))

vi.mock('@/stores', () => ({
  useHostsStore: () => ({
    hosts: [],
    fetchHosts: vi.fn(),
  }),
}))

type MockTerminalInstance = InstanceType<typeof Terminal> & {
  dataHandlers: ((data: string) => void)[]
  written: string[]
  disposed: boolean
}
type MockFitAddonInstance = InstanceType<typeof FitAddon> & { fitCalls: number }

/**
 * TerminalView 组件测试（task 6.4 + OrcaTerm 风格重设计）
 * WHY: 验证 xterm.js 终端视图与 WS /ws/terminal 通道的桥接：
 * open 握手（携带 hostId）、input 按键转发（含 Ctrl-C=\u0003）、
 * terminal_output 分发（data/error/closed）、close 断开。
 *
 * 组件现已集成 Shell/Agent 双模式，但本测试聚焦 Shell 模式的终端桥接逻辑。
 */
describe('TerminalView.vue', () => {
  let mockWsList: MockWebSocket[]
  let originalWebSocket: typeof globalThis.WebSocket

  /** 获取终端通道对应的 WebSocket（第一个创建的） */
  function termWs(): MockWebSocket {
    return mockWsList[0]
  }

  function lastTerminal(): MockTerminalInstance {
    const instances = (Terminal as unknown as { instances: MockTerminalInstance[] }).instances
    return instances[instances.length - 1]
  }

  function lastFitAddon(): MockFitAddonInstance {
    const instances = (FitAddon as unknown as { instances: MockFitAddonInstance[] }).instances
    return instances[instances.length - 1]
  }

  /** 模拟服务器经 /ws/terminal 通道下发 terminal_output 消息 */
  function serverSend(payload: unknown): void {
    termWs().simulateMessage(JSON.stringify(payload))
  }

  /** 取出终端通道已发送的全部消息（解析为对象） */
  function sentMessages(): unknown[] {
    return termWs().allSentData.map((raw) => JSON.parse(raw))
  }

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket
    mockWsList = []
    // WHY: TerminalView 创建两个 WebSocket（terminal + ai），每个需要独立的 mock 实例
    globalThis.WebSocket = vi.fn(() => {
      const ws = new MockWebSocket()
      mockWsList.push(ws)
      return ws
    }) as unknown as typeof WebSocket
    ;(Terminal as unknown as { instances: unknown[] }).instances = []
    ;(FitAddon as unknown as { instances: unknown[] }).instances = []
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  function mountView() {
    return mount(TerminalView)
  }

  it('挂载后连接 /ws/terminal 通道，并在连接建立时发送 action=open（携带 hostId）', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(globalThis.WebSocket).toHaveBeenCalledWith(`ws://${window.location.host}/ws/terminal`)

    termWs().simulateOpen()
    await flushPromises()

    expect(sentMessages()).toEqual([{ action: 'open', host_id: 'host-1' }])
    wrapper.unmount()
  })

  it('实例化 xterm Terminal 并加载/调用 FitAddon', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(lastTerminal()).toBeDefined()
    expect(lastFitAddon().fitCalls).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('收到 terminal_output(type=data) 时写入终端并记录 session_id', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()

    serverSend({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: 'hello\r\n' })
    await flushPromises()

    expect(lastTerminal().written).toContain('hello\r\n')
    wrapper.unmount()
  })

  it('获得 session_id 后，用户按键经 terminal_input(action=input) 转发', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()
    serverSend({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '$ ' })
    await flushPromises()

    // 模拟用户按键：触发 xterm 的 onData 回调
    for (const handler of lastTerminal().dataHandlers) {
      handler('ls -la\r')
    }
    await flushPromises()

    expect(sentMessages()).toContainEqual({ action: 'input', session_id: 'sess-1', data: 'ls -la\r' })
    wrapper.unmount()
  })

  it('Ctrl-C 按键转发为 \\u0003（Q1 裁定）', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()
    serverSend({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '$ ' })
    await flushPromises()

    for (const handler of lastTerminal().dataHandlers) {
      handler('\u0003')
    }
    await flushPromises()

    expect(sentMessages()).toContainEqual({ action: 'input', session_id: 'sess-1', data: '\u0003' })
    wrapper.unmount()
  })

  it('未获得 session_id 前，用户按键不会转发（open 握手未完成）', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()

    for (const handler of lastTerminal().dataHandlers) {
      handler('ls\r')
    }
    await flushPromises()

    // 仅有 open 一条消息，没有 input
    expect(sentMessages()).toEqual([{ action: 'open', host_id: 'host-1' }])
    wrapper.unmount()
  })

  it('收到 terminal_output(type=error) 时展示错误信息', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()

    serverSend({ type: 'error', error_code: 'auth_failed', message: '认证失败' })
    await flushPromises()

    expect(wrapper.text()).toContain('认证失败')
    wrapper.unmount()
  })

  it('收到 terminal_output(type=closed) 时更新状态提示会话结束', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()
    serverSend({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '$ ' })
    await flushPromises()

    serverSend({ type: 'closed', session_id: 'sess-1', end_reason: 'remote_close' })
    await flushPromises()

    expect(wrapper.text()).toContain('remote_close')
    wrapper.unmount()
  })

  it('组件卸载时发送 action=close 并断开连接（Q1 裁定）', async () => {
    const wrapper = mountView()
    await flushPromises()
    termWs().simulateOpen()
    await flushPromises()
    serverSend({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: '$ ' })
    await flushPromises()

    wrapper.unmount()
    await flushPromises()

    expect(sentMessages()).toContainEqual({ action: 'close', session_id: 'sess-1' })
    expect(termWs().closeCalled).toBe(true)
  })

  it('挂载时展示 Shell/Agent 双模式标签', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-mode="shell"]').exists()).toBe(true)
    expect(wrapper.find('[data-mode="agent"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

/**
 * Mock WebSocket（与 ws-client.spec.ts 一致），额外记录所有发送过的消息
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
