<template>
  <div class="terminal-view">
    <!-- 标签栏：Shell / Agent 双模式切换（OrcaTerm 风格） -->
    <div class="tab-bar">
      <div class="tab-group">
        <button
          class="tab-item"
          :class="{ active: activeMode === 'shell' }"
          data-mode="shell"
          @click="activeMode = 'shell'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Shell
        </button>
        <button
          class="tab-item"
          :class="{ active: activeMode === 'agent' }"
          data-mode="agent"
          @click="activeMode = 'agent'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 2a10 10 0 0 1 10 10" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          Agent
        </button>
      </div>

      <div class="tab-info">
        <span v-if="hostId" class="info-host" data-field="host-label">
          {{ hostId }}
        </span>
        <span class="info-status" :data-state="connectionState" data-field="connection-status">
          <span class="status-indicator"></span>
          {{ statusText }}
        </span>
      </div>
    </div>

    <!-- Shell 模式：交互式终端 -->
    <div v-show="activeMode === 'shell'" class="mode-panel mode-shell">
      <div ref="terminalContainer" class="terminal-container"></div>
      <p v-if="errorText" class="error-banner" data-region="error">{{ errorText }}</p>
    </div>

    <!-- Agent 模式：AI 对话面板 -->
    <div v-show="activeMode === 'agent'" class="mode-panel mode-agent">
      <div class="agent-toolbar">
        <select data-field="conversation" class="agent-select" :value="currentConversationId ?? ''" @change="onConversationChange">
          <option value="" disabled>选择会话</option>
          <option v-for="c in conversations" :key="c.id" :value="c.id">
            {{ c.title || '未命名会话' }}
          </option>
        </select>
        <button type="button" data-action="new-conversation" class="agent-btn" @click="newConversation">新会话</button>
        <select data-field="host" v-model="selectedHostId" class="agent-select">
          <option value="">不指定服务器</option>
          <option v-for="h in hostsStore.hosts" :key="h.id" :value="h.id ?? ''">
            {{ h.host }}:{{ h.port }}
          </option>
        </select>
        <span class="agent-status" :data-state="aiConnectionState">{{ aiStatusText }}</span>
      </div>

      <p v-if="aiChannelError" class="error-banner" data-region="channel-error">{{ aiChannelError }}</p>

      <div ref="messageListEl" class="agent-messages">
        <p v-if="messages.length === 0" class="agent-placeholder">
          输入运维问题开始对话，智能体将在人工审批约束下协助排障。
        </p>

        <div v-for="msg in messages" :key="msg.id" class="agent-message" :data-role="msg.role">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="msg-user">{{ msg.content }}</div>

          <!-- 助手消息 -->
          <template v-else>
            <details v-if="msg.thinking" class="msg-thinking" data-region="thinking">
              <summary>思考过程</summary>
              <div class="msg-thinking-text">{{ msg.thinking }}</div>
            </details>

            <div v-if="msg.toolCalls.length > 0" class="msg-tools">
              <div v-for="(tc, i) in msg.toolCalls" :key="i" class="msg-tool" data-region="tool-call">
                <div class="tool-head">
                  <span class="tool-name">{{ tc.toolName }}</span>
                  <span v-if="tc.auto === true" class="tool-badge tool-badge-auto">自动</span>
                  <span v-else-if="tc.resultStatus === undefined" class="tool-badge tool-badge-pending" data-status="pending-approval">
                    待审批
                  </span>
                  <span v-else class="tool-badge tool-badge-manual">已审批</span>
                </div>
                <pre class="tool-params">{{ formatParams(tc.toolParams) }}</pre>
                <div v-if="tc.resultStatus !== undefined" class="tool-result" :data-status="tc.resultStatus">
                  <span class="tool-badge" :class="resultBadgeClass(tc.resultStatus)">
                    {{ resultLabel(tc.resultStatus) }}
                  </span>
                  <pre v-if="tc.result" class="tool-result-text">{{ tc.result }}</pre>
                </div>
              </div>
            </div>

            <div class="msg-answer" data-region="answer">{{ msg.content }}</div>

            <div v-if="msg.errorMessage" class="msg-error" data-region="error">
              {{ msg.errorMessage }}
              <button
                v-if="msg.errorCode === ErrorCode.ApiKeyMissing"
                type="button"
                data-action="goto-settings"
                class="msg-error-link"
                @click="gotoSettings"
              >
                前往设置
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="agent-input">
        <textarea
          data-field="input"
          v-model="draft"
          rows="2"
          placeholder="描述运维目标，如：分析 /var/log 下占用最大的日志文件"
          @keydown.enter.exact.prevent="sendAiMessage"
        ></textarea>
        <button type="button" data-action="send" :disabled="streaming" class="agent-send-btn" @click="sendAiMessage">
          {{ streaming ? '回复中…' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createTerminalChannel, createAiChannel, type WsChannel, type WsConnectionState } from '@/ws'
import {
  TerminalInputAction,
  TerminalOutputType,
  AiStreamType,
  ErrorCode,
  type TerminalInput,
  type TerminalOutput,
  type AiStream,
  type ToolCallEvent,
  type ToolResultStatus,
} from '@/types'
import { conversationsApi, type Conversation, type Message } from '@/api'
import { useHostsStore } from '@/stores'

/**
 * 终端主视图（OrcaTerm 风格）
 *
 * WHY: Shell/Agent 双模式标签切换——专业 SSH 客户端将手动终端与 AI 助手集成在同一工作区，
 *      用户无需在不同页面间跳转。Shell 模式提供交互式 PTY 终端，Agent 模式提供 AI 对话。
 *
 * Shell 模式（task 6.4）：
 *   严格遵循 Q1 裁定的终端握手协议——连接后以 action=open（携带 hostId）发起会话，
 *   服务器首次下发 terminal_output 后才可转发用户按键。
 *
 * Agent 模式（task 9.6）：
 *   严格对齐冻结契约 asyncapi.yaml /ai 通道——用户提问经 ai_stream 发送，
 *   接收 thinking_delta/answer_delta 分区流式渲染，tool_call/tool_result 全程可视化。
 */

// ==================== 路由 & 基础状态 ====================
const route = useRoute()
const router = useRouter()
const hostsStore = useHostsStore()
const hostId = ref<string>(String(route.params.hostId ?? ''))

// ==================== 模式切换 ====================
// 如果没有 hostId（如从 /chat 路由进入），默认切到 Agent 模式
const activeMode = ref<'shell' | 'agent'>(hostId.value ? 'shell' : 'agent')

// ==================== Shell 模式状态 ====================
const terminalContainer = ref<HTMLElement | null>(null)
const connectionState = ref<WsConnectionState>('disconnected')
const statusText = ref('未连接')
const errorText = ref<string | null>(null)
const sessionId = ref<string | null>(null)

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let termChannel: WsChannel<TerminalInput, TerminalOutput> | null = null
let unsubTermMessage: (() => void) | null = null
let unsubTermState: (() => void) | null = null
let unsubTermData: { dispose: () => void } | null = null
let resizeHandler: (() => void) | null = null

// ==================== Agent 模式状态 ====================
const messages = ref<UiMessage[]>([])
const conversations = ref<Conversation[]>([])
const currentConversationId = ref<string | null>(null)
const selectedHostId = ref('')
const draft = ref('')
const streaming = ref(false)
const aiChannelError = ref<string | null>(null)
const aiConnectionState = ref<WsConnectionState>('disconnected')
const aiStatusText = ref('未连接')
const messageListEl = ref<HTMLElement | null>(null)

let aiChannel: WsChannel<AiStream, AiStream> | null = null
let unsubAiMessage: (() => void) | null = null
let unsubAiState: (() => void) | null = null

// ==================== Agent UI 模型 ====================
interface UiToolCall {
  toolName: string
  toolParams: Record<string, unknown>
  auto?: boolean
  approvalId?: string | null
  resultStatus?: ToolResultStatus
  result?: string | null
}

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking: string
  toolCalls: UiToolCall[]
  errorCode?: ErrorCode
  errorMessage?: string
}

let uiCounter = 0
function nextUiId(): string {
  uiCounter += 1
  return `ui-${uiCounter}`
}

// ==================== 生命周期 ====================
onMounted(async () => {
  initTerminal()
  initAiChannel()
  hostsStore.fetchHosts()
  await initConversations()
})

onBeforeUnmount(() => {
  cleanupTerminal()
  cleanupAi()
})

// ==================== Shell 模式：终端初始化 ====================
function initTerminal(): void {
  terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
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

  unsubTermData = terminal.onData(handleTerminalData)

  resizeHandler = () => {
    fitAddon?.fit()
  }
  window.addEventListener('resize', resizeHandler)

  termChannel = createTerminalChannel()
  unsubTermMessage = termChannel.onMessage(handleTerminalOutput)
  unsubTermState = termChannel.onStateChange(handleTermStateChange)
  termChannel.connect()
}

function handleTermStateChange(state: WsConnectionState): void {
  connectionState.value = state
  if (state === 'connected') {
    statusText.value = '正在建立会话...'
    termChannel?.send({ action: TerminalInputAction.Open, host_id: hostId.value })
  } else if (state === 'connecting') {
    statusText.value = '连接中...'
  } else {
    statusText.value = '已断开'
  }
}

function handleTerminalData(data: string): void {
  if (!termChannel || termChannel.state !== 'connected' || !sessionId.value) return
  termChannel.send({
    action: TerminalInputAction.Input,
    session_id: sessionId.value,
    data,
  })
}

function handleTerminalOutput(msg: TerminalOutput): void {
  if (msg.session_id && !sessionId.value) {
    sessionId.value = msg.session_id
  }
  switch (msg.type) {
    case TerminalOutputType.Data:
      if (msg.data !== undefined) {
        terminal?.write(msg.data)
      }
      statusText.value = '会话进行中'
      break
    case TerminalOutputType.Error:
      errorText.value = msg.message ?? '连接失败'
      statusText.value = '连接失败'
      break
    case TerminalOutputType.Closed:
      statusText.value = `已结束：${msg.end_reason ?? '未知原因'}`
      break
  }
}

function closeSession(): void {
  if (termChannel && termChannel.state === 'connected' && sessionId.value) {
    termChannel.send({ action: TerminalInputAction.Close, session_id: sessionId.value })
  }
  termChannel?.disconnect()
}

function cleanupTerminal(): void {
  unsubTermData?.dispose()
  unsubTermData = null
  unsubTermMessage?.()
  unsubTermMessage = null
  unsubTermState?.()
  unsubTermState = null
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  closeSession()
  termChannel = null
  terminal?.dispose()
  terminal = null
  fitAddon = null
}

// ==================== Agent 模式：AI 通道 ====================
function initAiChannel(): void {
  aiChannel = createAiChannel()
  unsubAiMessage = aiChannel.onMessage(handleAiStream)
  unsubAiState = aiChannel.onStateChange(handleAiStateChange)
  aiChannel.connect()
}

function handleAiStateChange(state: WsConnectionState): void {
  aiConnectionState.value = state
  aiStatusText.value = state === 'connected' ? '已连接' : state === 'connecting' ? '连接中...' : '已断开'
}

async function initConversations(): Promise<void> {
  try {
    conversations.value = await conversationsApi.listConversations()
    if (conversations.value.length > 0) {
      const latest = [...conversations.value].sort((a, b) => convTime(b) - convTime(a))[0]
      await selectConversation(latest.id)
    }
  } catch (e) {
    aiChannelError.value = `加载会话列表失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function convTime(c: Conversation): number {
  const t = c.updatedAt ?? c.createdAt
  return t instanceof Date ? t.getTime() : new Date(t).getTime()
}

async function selectConversation(id: string): Promise<void> {
  currentConversationId.value = id
  streaming.value = false
  try {
    const history = await conversationsApi.listConversationMessages({ id })
    messages.value = history.items
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map(fromHistoryMessage)
    scrollToBottom()
  } catch (e) {
    aiChannelError.value = `加载历史消息失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function fromHistoryMessage(m: Message): UiMessage {
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content ?? '',
    thinking: m.thinkingContent ?? '',
    toolCalls: (m.toolCalls ?? []).map((tc) => ({
      toolName: tc.toolName,
      toolParams: tc.toolParams ?? {},
      auto: tc.approvalId == null,
      approvalId: tc.approvalId,
      resultStatus: tc.resultStatus,
      result: tc.result,
    })),
  }
}

function onConversationChange(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  if (id) void selectConversation(id)
}

function newConversation(): void {
  currentConversationId.value = null
  messages.value = []
  streaming.value = false
  aiChannelError.value = null
}

async function sendAiMessage(): Promise<void> {
  const text = draft.value.trim()
  if (!text || streaming.value) return
  if (!aiChannel || aiChannel.state !== 'connected') {
    aiChannelError.value = 'AI 通道未连接，请稍后重试'
    return
  }
  aiChannelError.value = null
  draft.value = ''

  if (!currentConversationId.value) {
    try {
      const conv = await conversationsApi.createConversation({
        conversationCreate: selectedHostId.value ? { hostId: selectedHostId.value } : {},
      })
      currentConversationId.value = conv.id
      conversations.value = [...conversations.value, conv]
    } catch (e) {
      aiChannelError.value = `创建会话失败：${e instanceof Error ? e.message : String(e)}`
      draft.value = text
      return
    }
  }

  messages.value.push({ id: nextUiId(), role: 'user', content: text, thinking: '', toolCalls: [] })
  messages.value.push({ id: nextUiId(), role: 'assistant', content: '', thinking: '', toolCalls: [] })
  streaming.value = true
  scrollToBottom()

  aiChannel.send({
    type: AiStreamType.UserMessage,
    conversation_id: currentConversationId.value,
    content: text,
    ...(selectedHostId.value ? { host_id: selectedHostId.value } : {}),
  })
}

function handleAiStream(msg: AiStream): void {
  if (msg.conversation_id !== currentConversationId.value) return
  switch (msg.type) {
    case AiStreamType.ThinkingDelta:
      ensureAssistantMessage().thinking += msg.content ?? ''
      scrollToBottom()
      break
    case AiStreamType.AnswerDelta:
      ensureAssistantMessage().content += msg.content ?? ''
      scrollToBottom()
      break
    case AiStreamType.ToolCall:
      handleToolCall(msg.tool_call)
      break
    case AiStreamType.ToolResult:
      handleToolResult(msg.tool_call)
      break
    case AiStreamType.Final:
      streaming.value = false
      break
    case AiStreamType.Error:
      handleError(msg)
      break
  }
}

function ensureAssistantMessage(): UiMessage {
  const last = messages.value[messages.value.length - 1]
  if (last && last.role === 'assistant') return last
  const created: UiMessage = { id: nextUiId(), role: 'assistant', content: '', thinking: '', toolCalls: [] }
  messages.value.push(created)
  return created
}

function handleToolCall(tc: ToolCallEvent | undefined): void {
  if (!tc) return
  ensureAssistantMessage().toolCalls.push({
    toolName: tc.tool_name ?? 'unknown',
    toolParams: tc.tool_params ?? {},
    auto: tc.auto,
    approvalId: tc.approval_id,
  })
  scrollToBottom()
}

function handleToolResult(tc: ToolCallEvent | undefined): void {
  if (!tc) return
  const assistant = ensureAssistantMessage()
  const pending = [...assistant.toolCalls].reverse()
  const target =
    (tc.approval_id
      ? pending.find((t) => t.approvalId === tc.approval_id && t.resultStatus === undefined)
      : undefined) ??
    pending.find((t) => t.resultStatus === undefined && (!tc.tool_name || t.toolName === tc.tool_name)) ??
    pending.find((t) => t.resultStatus === undefined)
  if (target) {
    target.resultStatus = tc.result_status
    target.result = tc.result
  }
  scrollToBottom()
}

function handleError(msg: AiStream): void {
  streaming.value = false
  const assistant = ensureAssistantMessage()
  assistant.errorCode = msg.error_code
  assistant.errorMessage = msg.message ?? defaultErrorText(msg.error_code)
}

function defaultErrorText(code: ErrorCode | undefined): string {
  switch (code) {
    case ErrorCode.ApiKeyMissing: return '请先在设置中配置模型 api key'
    case ErrorCode.ModelEndpointUnreachable: return '模型端点不可达，请检查模型配置'
    case ErrorCode.ModelEndpointError: return '模型端点返回错误，请稍后重试'
    default: return 'AI 请求处理出错'
  }
}

function gotoSettings(): void {
  void router.push('/settings')
}

function cleanupAi(): void {
  unsubAiMessage?.()
  unsubAiMessage = null
  unsubAiState?.()
  unsubAiState = null
  aiChannel?.disconnect()
  aiChannel = null
}

// ==================== 展示辅助 ====================
function formatParams(params: Record<string, unknown>): string {
  try { return JSON.stringify(params, null, 2) } catch { return String(params) }
}

function resultLabel(status: ToolResultStatus): string {
  switch (status) {
    case 'success': return '执行成功'
    case 'rejected': return '已拒绝'
    case 'execution_timeout': return '执行超时'
    case 'output_truncated': return '输出已截断'
    case 'error': return '执行出错'
    default: return String(status)
  }
}

function resultBadgeClass(status: ToolResultStatus): string {
  return status === 'success' ? 'tool-badge-ok' : 'tool-badge-err'
}

function scrollToBottom(): void {
  void nextTick(() => {
    const el = messageListEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
</script>

<style scoped>
.terminal-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
}

/* ===== 标签栏 ===== */
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  min-height: 36px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  padding: 0 8px;
  gap: 8px;
}

.tab-group {
  display: flex;
  gap: 2px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
  background: transparent;
  border: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab-item:hover {
  background: #21262d;
  color: #c9d1d9;
}

.tab-item.active {
  background: #0d1117;
  color: #58a6ff;
  border-bottom: 2px solid #58a6ff;
}

.tab-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  font-size: 12px;
}

.info-host {
  color: #8b949e;
  font-family: 'SF Mono', Consolas, monospace;
}

.info-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #3fb950;
}

.info-status[data-state='disconnected'] {
  color: #f85149;
}

.info-status[data-state='connecting'] {
  color: #d29922;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* ===== 模式面板 ===== */
.mode-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Shell 模式 */
.mode-shell {
  background: #0d1117;
}

.terminal-container {
  flex: 1;
  padding: 4px;
}

/* Agent 模式 */
.mode-agent {
  background: #0d1117;
  display: flex;
  flex-direction: column;
}

.agent-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
}

.agent-select {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.agent-btn {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.agent-btn:hover {
  background: #30363d;
}

.agent-status {
  font-size: 11px;
  color: #3fb950;
  margin-left: auto;
}

.agent-status[data-state='disconnected'] {
  color: #f85149;
}

/* 消息列表 */
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-placeholder {
  color: #484f58;
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}

.agent-message[data-role='user'] {
  align-self: flex-end;
  max-width: 75%;
}

.msg-user {
  background: #1f6feb;
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  line-height: 1.5;
}

.agent-message[data-role='assistant'] {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msg-thinking {
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
}

.msg-thinking summary {
  cursor: pointer;
  color: #d2a8ff;
  font-size: 12px;
}

.msg-thinking-text {
  white-space: pre-wrap;
  margin-top: 6px;
  color: #8b949e;
  font-size: 12px;
}

.msg-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg-tool {
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 8px 10px;
  background: #161b22;
  font-size: 12px;
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-name {
  font-family: 'SF Mono', Consolas, monospace;
  color: #d2a8ff;
}

.tool-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.tool-badge-auto {
  background: #238636;
  color: #ffffff;
}

.tool-badge-pending {
  background: #9e6a03;
  color: #ffffff;
}

.tool-badge-manual {
  background: #8957e5;
  color: #ffffff;
}

.tool-badge-ok {
  background: #238636;
  color: #ffffff;
}

.tool-badge-err {
  background: #da3633;
  color: #ffffff;
}

.tool-params,
.tool-result-text {
  margin-top: 6px;
  background: #0d1117;
  border-radius: 4px;
  padding: 6px 8px;
  color: #7ee787;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}

.msg-answer {
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 13px;
  color: #c9d1d9;
}

.msg-error {
  color: #f85149;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-error-link {
  color: #58a6ff;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  font-size: 12px;
}

/* 输入栏 */
.agent-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #21262d;
  background: #161b22;
}

.agent-input textarea {
  flex: 1;
  background: #0d1117;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 8px 10px;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.agent-input textarea:focus {
  outline: none;
  border-color: #58a6ff;
}

.agent-send-btn {
  padding: 0 16px;
  background: #238636;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.agent-send-btn:disabled {
  background: #21262d;
  color: #484f58;
  cursor: not-allowed;
}

.agent-send-btn:not(:disabled):hover {
  background: #2ea043;
}

/* 通用 */
.error-banner {
  color: #f85149;
  padding: 8px 12px;
  font-size: 12px;
}
</style>
