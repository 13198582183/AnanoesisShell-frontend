<template>
  <div class="terminal-timeline">
    <!--
      单一 xterm 终端（OrcaTerm 风格·回归纯终端）
      WHY: 此前「分段内嵌流」把终端历史封存为 HTML 段再插入 AI/卡片，衍生出
           双滚动条、空卡片、重复弹窗、ANSI→HTML 着色等一系列问题。经与用户确认，
           审批改回非阻断浮动弹窗（由 WorkspaceView 承载），终端回归「一个持续 xterm」：
           - Shell 输出、AI 回复、命令审批留痕，全部按时间顺序写入同一个 xterm；
           - 滚动交给 xterm 原生 scrollback，单一滚动条，不再有嵌套滚动容器；
           - 命令留痕是纯文本行（含 ⏳待审批 / →已执行 / →已拒绝 状态），随历史自然沉淀。
    -->
    <div ref="terminalContainer" class="terminal-container" data-region="active-terminal" :data-session-id="activeSessionId"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * TerminalTimeline 组件（单一 xterm·纯终端渲染）
 *
 * 职责边界：只负责承载一个 xterm 实例、按模式路由输入、把字节写入终端。
 * 不做审批交互（在 WorkspaceView 的浮动弹窗），不做 AI 消息卡片（AI 内容以文本写入本终端）。
 *
 * 不变量：
 *   1) Shell 与 Agent 共用同一个 xterm，切换仅改变输入归属，绝不销毁/重连终端；
 *   2) 所有可见内容（终端输出 / AI 文本 / 命令留痕）按时间顺序进入同一滚动流；
 *   3) 每个 tab 对应一个独立组件实例（WorkspaceView 按 workspace v-for），
 *      实例在后台（v-show 隐藏）时 write 仍进自己的 buffer，切回必须调 refit()
 *      恢复尺寸并重绘——历史不丢是命令留痕红线的硬要求。
 */

const props = defineProps<{
  activeSessionId: string
  /** 当前输入模式：shell=直接转发到PTY，agent=内联提示行 */
  mode: 'shell' | 'agent'
  /**
   * 断线终态（会话已关闭/连接失败）：此时输入无投递目标，
   * 拦截 r/R 键 emit reconnect（对标 MobaXterm 断线后按 r 重连），
   * 其余键入丢弃；重连按钮与提示文案由父级（WorkspaceView）承载。
   */
  disconnected?: boolean
  /**
   * Agent 回合在飞（后端正在思考/工具循环中）：此时 Ctrl+C 从
   * “取消输入草稿”升级为“打断回合”——写 ^C 留痕并 emit agentStop，
   * 由父级经 AI 通道发 stop_turn；对标 Shell 模式 Ctrl+C 打断程序的体验。
   */
  generating?: boolean
}>()

const emit = defineEmits<{
  shellInput: [data: string]
  agentInput: [text: string]
  resize: [cols: number, rows: number]
  /** 断线态下用户按 r/R 请求重建终端会话 */
  reconnect: []
  /** 生成态下 Ctrl+C 请求打断在飞回合（父级翻 stop_turn 协议） */
  agentStop: []
}>()

const terminalContainer = ref<HTMLElement | null>(null)

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeHandler: (() => void) | null = null
let dataDisposable: { dispose: () => void } | null = null

/** 是否写了占位提示（“连接中...”或 ❯ 输入符），用于第一条真实输出到达时清除 */
let initialPromptWritten = false

onMounted(() => {
  initTerminal()
})

onBeforeUnmount(() => {
  cleanupTerminal()
})

/** 监听 activeSessionId 变化——tab 切换（旧值非空）时清空终端（不同连接实例历史独立） */
watch(
  () => props.activeSessionId,
  (newVal, oldVal) => {
    // WHY: 首次建立会话（空 → 非空）不算切换：终端刚挂载尚无历史，不应多写一次提示
    if (!oldVal && newVal) return
    if (newVal) {
      initialPromptWritten = false
      terminal?.reset()
      showInitialPrompt()
    }
  },
)

/** Agent 模式输入提示符：中性 ❯ 前缀
 *  WHY: 此前用 [AI] 前缀，导致用户提问行看起来像 AI 输出——
 *       [AI] 前缀专属 AI 回答行（由 WorkspaceView 写入），输入行用无歧义符号 */
const AGENT_PROMPT = '\x1b[36m❯\x1b[0m '

/**
 * 监听模式切换——非破坏式，不写提示符。
 * WHY: Shell 与 Agent 共用同一个 xterm，切换仅改变输入路由，
 *      绝不 clear/reset 终端、不写“连接中...”。
 *      ❯ 提示符采用惰性补打（见 handleAgentKey）：切模式时若立即写，
 *      远端 PTY 的异步输出（如 resize 引发的 bash 提示符重绘）会把光标
 *      拽回提示符行，用户输入看起来像打进了 shell——惰性补打保证
 *      用户真正键入时输入行永远以 ❯ 开头、独占新行。
 */
watch(
  () => props.mode,
  () => {
    agentDraft = ''
    agentPromptOpen = false
  },
)

// ==================== 终端初始化 ====================
function initTerminal(): void {
  terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
    scrollback: 10000,
    theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff' },
    fontFamily: "'SF Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.3,
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  if (terminalContainer.value) {
    terminal.open(terminalContainer.value)
  }
  fitAddon.fit()

  // WHY: 统一在 onData 中根据模式分发——Shell 转发 PTY，Agent 本地处理；
  //      断线终态下输入无投递目标，仅保留 r/R 作为重连快捷键（MobaXterm 惯例），
  //      其余字节丢弃——继续转发只会收到后端“会话不存在”错误风暴
  dataDisposable = terminal.onData((data: string) => {
    if (props.disconnected) {
      if (data === 'r' || data === 'R') {
        emit('reconnect')
      }
      return
    }
    if (props.mode === 'shell') {
      emit('shellInput', data)
    } else {
      handleAgentKey(data)
    }
  })

  resizeHandler = () => {
    fitAddon?.fit()
    if (terminal) {
      emit('resize', terminal.cols, terminal.rows)
    }
  }
  window.addEventListener('resize', resizeHandler)

  showInitialPrompt()
}

// ==================== Agent 模式内联输入状态 ====================
let agentDraft = ''
/** ❯ 提示符是否已在当前行打开（惰性补打：用户首次键入时才写提示符） */
let agentPromptOpen = false

/** 若输入行尚未打开，在新行补打 ❯ 提示符（保证输入行不被 PTY 异步输出拼接） */
function ensureAgentPromptLine(): void {
  if (!terminal || agentPromptOpen) return
  terminal.write('\r\n' + AGENT_PROMPT)
  agentPromptOpen = true
}

function handleAgentKey(data: string): void {
  if (!terminal) return

  // Enter → 提交（空输入忽略，避免无意义刷屏）
  if (data === '\r') {
    if (!agentDraft.trim()) return
    const text = agentDraft
    terminal.write('\r\n')
    agentDraft = ''
    agentPromptOpen = false
    emit('agentInput', text)
    return
  }

  // Ctrl+C → 取消当前输入；回合在飞时升级为打断（对标 Shell 打断体验）
  if (data === '\x03') {
    if (props.generating) {
      // 组件无自行停回合能力，只通知父级发 stop_turn；
      // 不清任何流式状态——后端中断后会发 final+停止注记，既有流处理复位
      terminal.write('\r\n^C\r\n')
      agentDraft = ''
      agentPromptOpen = false
      emit('agentStop')
      return
    }
    if (agentPromptOpen) {
      terminal.write('\r\n^C\r\n')
      agentPromptOpen = false
    }
    agentDraft = ''
    return
  }

  // Backspace
  if (data === '\x7f' && agentDraft.length > 0) {
    agentDraft = agentDraft.slice(0, -1)
    terminal.write('\b \b')
    return
  }

  // 可打印文本（含 IME 中文）→ 惰性补打提示符后回显累积
  // WHY: IME 输入经 onData 到达时已是完整字符串（可能 length > 1），
  //      只需排除以 \x1b 开头的转义序列（方向键、功能键等）
  if (!data.startsWith('\x1b')) {
    ensureAgentPromptLine()
    agentDraft += data
    terminal.write(data)
    return
  }
}

// ==================== 提示行渲染 ====================
function showInitialPrompt(): void {
  if (!terminal) return
  if (props.mode === 'shell') {
    terminal.write('\x1b[2m连接中...\x1b[0m')
    initialPromptWritten = true
  } else {
    // Agent 模式：❯ 惰性补打，挂载时只给一行暗淡提示，避免与 PTY 输出抢行
    terminal.write('\x1b[2m[Agent] 输入问题即开始对话\x1b[0m')
    initialPromptWritten = true
  }
}

// ==================== 清理 ====================
function cleanupTerminal(): void {
  dataDisposable?.dispose()
  dataDisposable = null
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  terminal?.dispose()
  terminal = null
  fitAddon = null
}

// ==================== 公共方法 ====================
/**
 * 向终端写入原始字节（PTY 输出 / AI 文本 / 命令留痕统一走此入口）。
 * @param data 含 ANSI 转义序列的原始字符串，由 xterm 负责渲染与着色
 */
function writeToTerminal(data: string): void {
  // WHY: 第一条真实输出到达时清除占位提示行，避免它与输出拼在同一行
  if (initialPromptWritten && terminal) {
    terminal.write('\r\x1b[K')
    initialPromptWritten = false
  }
  terminal?.write(data)
  scrollToBottom()
}

/** 滚动到终端底部 */
function scrollToBottom(): void {
  nextTick(() => terminal?.scrollToBottom())
}

/**
 * 实例从隐藏（v-show=false）切回可见时调用：重新 fit 并重绘全部行。
 * WHY: 隐藏期间容器尺寸为 0，fitAddon.fit() 静默不生效、渲染器跟不上尺寸，
 *      但 write 进 buffer 的历史不丢——切回后重算尺寸 + refresh 即可完整找回画面。
 */
function refit(): void {
  if (!terminal) return
  fitAddon?.fit()
  terminal.refresh(0, terminal.rows - 1)
  scrollToBottom()
}

defineExpose({
  writeToTerminal,
  scrollToBottom,
  refit,
})
</script>

<style scoped>
.terminal-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
  overflow: hidden;
}

.terminal-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 4px 6px;
  background: #0d1117;
}

/* WHY: xterm 内部滚动条默认跟随系统（白底），在暗色主题下对比刺眼；
       定制为 GitHub Dark 风格细条，与整体视觉一致 */
.terminal-container :deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: #30363d #0d1117;
}

.terminal-container :deep(.xterm-viewport)::-webkit-scrollbar {
  width: 10px;
}

.terminal-container :deep(.xterm-viewport)::-webkit-scrollbar-track {
  background: #0d1117;
}

.terminal-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 5px;
  border: 2px solid #0d1117;
}

.terminal-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
</style>
