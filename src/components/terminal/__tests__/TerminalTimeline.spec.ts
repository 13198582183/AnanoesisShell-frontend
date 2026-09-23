import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TerminalTimeline from '@/components/terminal/TerminalTimeline.vue'

/**
 * TerminalTimeline 组件测试（单一 xterm 架构）
 * WHY: 回归「一个持续 xterm」设计后，组件职责收窄为：
 *      1) 承载单个 xterm 实例（scrollback 原生滚动，无嵌套滚动容器）；
 *      2) 按模式路由输入（shell→转发 PTY，agent→内联回显后提交）；
 *      3) 暴露 writeToTerminal 供父级写入终端输出 / AI 文本 / 审批留痕。
 *      不再包含分段封存、内嵌审批卡、AI 消息块（均已迁至弹窗 + 终端文本）。
 */

// 捕获传给 terminal.onData 的回调，便于模拟用户按键
let capturedOnData: ((data: string) => void) | null = null
const mockWrite = vi.fn()

vi.mock('@xterm/xterm', () => {
  return {
    Terminal: vi.fn().mockImplementation(() => ({
      write: mockWrite,
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      reset: vi.fn(),
      scrollToBottom: vi.fn(),
      open: vi.fn(),
      onData: vi.fn((cb: (data: string) => void) => {
        capturedOnData = cb
        return { dispose: vi.fn() }
      }),
      element: document.createElement('div'),
      cols: 80,
      rows: 24,
    })),
  }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}))

/** 以指定模式挂载组件（disconnected=断线终态，键盘输入被拦截用于重连触发） */
function mountTimeline(mode: 'shell' | 'agent' = 'shell', disconnected = false) {
  return mount(TerminalTimeline, {
    props: { activeSessionId: 'session-1', mode, disconnected },
  })
}

/** 通过捕获的 onData 回调模拟用户键入 */
function typeData(data: string): void {
  capturedOnData?.(data)
}

describe('TerminalTimeline.vue（单一 xterm）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnData = null
  })

  it('渲染终端容器并携带活动会话标识', () => {
    const wrapper = mountTimeline()
    const container = wrapper.find('[data-region="active-terminal"]')
    expect(container.exists()).toBe(true)
    expect(container.attributes('data-session-id')).toBe('session-1')
  })

  it('Shell 模式挂载时展示"连接中..."初始提示', () => {
    mountTimeline('shell')
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('连接中'))
  })

  it('Shell 模式按键直接转发 PTY（shellInput）', () => {
    const wrapper = mountTimeline('shell')
    typeData('ls\r')
    expect(wrapper.emitted('shellInput')).toEqual([['ls\r']])
    // 转发给 PTY 的内容不由组件本地回显（回显来自远端 shell）
    expect(mockWrite).not.toHaveBeenCalledWith('ls\r')
  })

  it('Agent 模式首次键入惰性补打 ❯ 提示符，后续键入直接回显且不转发 PTY', () => {
    const wrapper = mountTimeline('agent')
    mockWrite.mockClear()
    typeData('如')
    // 首个可打印字符：先在新行补打提示符，再回显字符
    expect(mockWrite).toHaveBeenNthCalledWith(1, '\r\n\x1b[36m❯\x1b[0m ')
    expect(mockWrite).toHaveBeenNthCalledWith(2, '如')
    mockWrite.mockClear()
    typeData('何')
    // 提示符已打开：不再重复补打
    expect(mockWrite).not.toHaveBeenCalledWith('\r\n\x1b[36m❯\x1b[0m ')
    expect(mockWrite).toHaveBeenCalledWith('何')
    expect(wrapper.emitted('shellInput')).toBeUndefined()
  })

  it('Agent 模式 Enter 提交累积文本（agentInput）并换行', () => {
    const wrapper = mountTimeline('agent')
    typeData('查看磁盘占用')
    mockWrite.mockClear()
    typeData('\r')
    expect(wrapper.emitted('agentInput')).toEqual([['查看磁盘占用']])
    expect(mockWrite).toHaveBeenCalledWith('\r\n')
  })

  it('Agent 模式空输入按 Enter 不提交也不写入', () => {
    const wrapper = mountTimeline('agent')
    mockWrite.mockClear()
    typeData('\r')
    expect(wrapper.emitted('agentInput')).toBeUndefined()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('Agent 模式 Ctrl+C 取消当前输入（已打开提示行时写 ^C）', () => {
    const wrapper = mountTimeline('agent')
    typeData('半成品')
    mockWrite.mockClear()
    typeData('\x03')
    expect(wrapper.emitted('agentInput')).toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith('\r\n^C\r\n')
    // 非生成态：Ctrl+C 只是取消输入，不触发回合打断
    expect(wrapper.emitted('agentStop')).toBeUndefined()
    // 取消后旧草稿不残留：重新键入惰性补打新提示行，再 Enter 提交的是新内容
    typeData('x')
    typeData('\r')
    expect(wrapper.emitted('agentInput')).toEqual([['x']])
  })

  it('Agent 回合进行中 Ctrl+C → emit agentStop 打断在飞回合', () => {
    // WHY：用户反馈——Agent 对话要能像 Shell 一样 Ctrl+C 打断；
    // 生成态（generating）下组件无法自行停回合，必须通知父级经 AI 通道发 stop_turn
    const wrapper = mount(TerminalTimeline, {
      props: { activeSessionId: 'session-1', mode: 'agent', generating: true },
    })
    mockWrite.mockClear()
    typeData('\x03')
    expect(wrapper.emitted('agentStop')).toEqual([[]])
    expect(wrapper.emitted('agentInput')).toBeUndefined()
    // 留痕：终端可见 ^C，与 Shell 打断体验对齐
    expect(mockWrite).toHaveBeenCalledWith('\r\n^C\r\n')
  })

  it('Agent 模式 Backspace 删除草稿字符', () => {
    const wrapper = mountTimeline('agent')
    typeData('ab')
    typeData('\x7f')
    typeData('\r')
    expect(wrapper.emitted('agentInput')).toEqual([['a']])
  })

  it('转义序列（方向键等）在 Agent 模式下被忽略不补打提示行', () => {
    const wrapper = mountTimeline('agent')
    mockWrite.mockClear()
    typeData('\x1b[A')
    expect(mockWrite).not.toHaveBeenCalled()
    typeData('\r')
    expect(wrapper.emitted('agentInput')).toBeUndefined()
  })

  it('切换到 Agent 模式时不写提示符不破坏历史（惰性补打），也不重连', async () => {
    const wrapper = mountTimeline('shell')
    mockWrite.mockClear()
    await wrapper.setProps({ mode: 'agent' })
    // 切模式零写入：提示符等用户首次键入时才补打
    expect(mockWrite).not.toHaveBeenCalled()
    // 非破坏式切换：不得重写“连接中...”占位
    expect(mockWrite).not.toHaveBeenCalledWith(expect.stringContaining('连接中'))
  })

  it('writeToTerminal 写入内容并清除初始"连接中..."占位', async () => {
    const wrapper = mountTimeline('shell')
    mockWrite.mockClear()
    const vm = wrapper.vm as unknown as { writeToTerminal: (data: string) => void }
    vm.writeToTerminal('hello')
    await nextTick()
    // 先清行（\r\x1b[K）再写内容
    expect(mockWrite).toHaveBeenNthCalledWith(1, '\r\x1b[K')
    expect(mockWrite).toHaveBeenNthCalledWith(2, 'hello')
    // 第二次写入不再清行
    mockWrite.mockClear()
    vm.writeToTerminal('world')
    expect(mockWrite).not.toHaveBeenCalledWith('\r\x1b[K')
    expect(mockWrite).toHaveBeenCalledWith('world')
  })

  it('会话切换时重置终端并重新展示初始提示', async () => {
    const wrapper = mountTimeline('shell')
    mockWrite.mockClear()
    await wrapper.setProps({ activeSessionId: 'session-2' })
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('连接中'))
  })

  // ============ 断线重连（对标 MobaXterm 按 r 重连） ============

  it('断线态下普通键入被丢弃：不转发 PTY 也不本地回显', () => {
    const wrapper = mountTimeline('shell', true)
    mockWrite.mockClear()
    typeData('ls\r')
    // 会话已结束，输入无投递目标：转发与回显都应静默
    expect(wrapper.emitted('shellInput')).toBeUndefined()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('断线态下按 r / R 键触发 reconnect 事件（大小写均可）', () => {
    const wrapper = mountTimeline('shell', true)
    mockWrite.mockClear()
    typeData('r')
    typeData('R')
    expect(wrapper.emitted('reconnect')).toHaveLength(2)
    // 重连触发不产生终端写入（提示行由父级统一写入，避免双写）
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('断线态下 Agent 模式按 r 同样触发 reconnect 而非输入回显', () => {
    const wrapper = mountTimeline('agent', true)
    mockWrite.mockClear()
    typeData('r')
    expect(wrapper.emitted('reconnect')).toHaveLength(1)
    expect(wrapper.emitted('agentInput')).toBeUndefined()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('未断线时 r 键行为不变：Shell 正常转发，不触发 reconnect', () => {
    const wrapper = mountTimeline('shell', false)
    typeData('r')
    expect(wrapper.emitted('shellInput')).toEqual([['r']])
    expect(wrapper.emitted('reconnect')).toBeUndefined()
  })
})
