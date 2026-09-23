<template>
  <div class="ai-chat-view">
    <div class="chat-header">
      <h1>AI 对话</h1>
      <select
        data-field="conversation"
        class="conversation-select"
        :value="currentConversationId ?? ''"
        @change="onConversationChange"
      >
        <option value="" disabled>选择会话</option>
        <option v-for="c in conversations" :key="c.id" :value="c.id">
          {{ c.title || '未命名会话' }}
        </option>
      </select>
      <button type="button" data-action="new-conversation" @click="newConversation">新会话</button>
      <select data-field="host" v-model="selectedHostId" class="host-select">
        <option value="">不指定服务器</option>
        <option v-for="h in hostsStore.hosts" :key="h.id" :value="h.id ?? ''">
          {{ h.host }}:{{ h.port }}
        </option>
      </select>
      <span class="status" :data-state="connectionState">{{ statusText }}</span>
    </div>

    <p v-if="channelError" class="error-banner" data-region="channel-error">{{ channelError }}</p>

    <div ref="messageListEl" class="message-list">
      <p v-if="messages.length === 0" class="placeholder">
        输入运维问题开始对话，智能体将在人工审批约束下协助排障。
      </p>

      <div v-for="msg in messages" :key="msg.id" class="message" :data-role="msg.role">
        <!-- 用户消息 -->
        <div v-if="msg.role === 'user'" class="user-bubble">{{ msg.content }}</div>

        <!-- 助手消息：思考过程（可折叠）、工具调用、最终回答或错误提示 -->
        <template v-else>
          <details v-if="msg.thinking" class="thinking-block" data-region="thinking">
            <summary>思考过程</summary>
            <div class="thinking-text">{{ msg.thinking }}</div>
          </details>

          <div v-if="msg.toolCalls.length > 0" class="tool-calls">
            <div
              v-for="(tc, i) in msg.toolCalls"
              :key="i"
              class="tool-call"
              data-region="tool-call"
            >
              <div class="tool-head">
                <span class="tool-name">{{ tc.toolName }}</span>
                <span v-if="tc.auto === true" class="badge badge-auto">自动执行</span>
                <span
                  v-else-if="tc.resultStatus === undefined"
                  class="badge badge-pending"
                  data-status="pending-approval"
                >
                  等待审批<template v-if="tc.approvalId">（{{ tc.approvalId }}）</template>
                </span>
                <span v-else class="badge badge-manual">人工审批</span>
              </div>
              <pre class="tool-params">{{ formatParams(tc.toolParams) }}</pre>
              <div v-if="tc.resultStatus !== undefined" class="tool-result" :data-status="tc.resultStatus">
                <span class="badge" :class="resultBadgeClass(tc.resultStatus)">
                  {{ resultLabel(tc.resultStatus) }}
                </span>
                <pre v-if="tc.result" class="tool-result-text">{{ tc.result }}</pre>
              </div>
            </div>
          </div>

          <div class="answer-block" data-region="answer">{{ msg.content }}</div>

          <div v-if="msg.errorMessage" class="error-banner" data-region="error">
            {{ msg.errorMessage }}
            <button
              v-if="msg.errorCode === ErrorCode.ApiKeyMissing"
              type="button"
              data-action="goto-settings"
              @click="gotoSettings"
            >
              前往设置
            </button>
          </div>
        </template>
      </div>
    </div>

    <div class="input-bar">
      <textarea
        data-field="input"
        v-model="draft"
        rows="2"
        placeholder="描述你的运维目标，如：分析 /var/log 下占用最大的日志文件"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button type="button" data-action="send" :disabled="streaming" @click="send">
        {{ streaming ? '回复中…' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { conversationsApi, type Conversation, type Message } from '@/api'
import { createAiChannel, type WsChannel, type WsConnectionState } from '@/ws'
import {
  AiStreamType,
  ErrorCode,
  type AiStream,
  type ToolCallEvent,
  type ToolResultStatus,
} from '@/types'
import { useHostsStore } from '@/stores'

/**
 * AI 对话面板（task 9.6）
 *
 * WHY: 严格对齐冻结契约 asyncapi.yaml /ai 通道——
 * - 用户提问走 ai_stream(type=user_message) 客户端→服务器发送（Q2 裁定），不使用 REST 提交；
 * - 接收 thinking_delta/answer_delta 分区流式渲染（model-provider「思考与非思考双模式」
 *   「流式响应」），思考过程放可折叠区并与最终回答视觉区分；
 * - tool_call/tool_result 全程可视化（ai-agent「操作透明性」，Q8 裁定：只有 auto=true 才
 *   副作用 auto=false+approval_id 均展示；副作用工具在结果到达前显示「等待审批」，
 *   实际审批决策由全局 ApprovalModal 走 /approval 通道完成，本视图不重复实现）；
 * - error(api_key_missing) 提示「请先在设置中配置模型 api key」并可跳转设置页
 *   （credential-store「未配置 api key 即使用 AI」）；
 * - 会话/历史用 ConversationsApi（R16/R17/R18）：多轮对话在同一 conversation_id 内延续。
 */

// ---------------- UI 视图模型 ----------------
// WHY: 这是纯前端渲染模型（聚合流式增量与 REST 历史两种来源），不是契约线格式类型，
// 契约类型一律复用 @/types（WS）与 @/api generated（REST），此处不重复手写。

interface UiToolCall {
  toolName: string
  toolParams: Record<string, unknown>
  /** true=只读自动执行；false/undefined=副作用须审批 */
  auto?: boolean
  approvalId?: string | null
  resultStatus?: ToolResultStatus
  result?: string | null
}

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  /** 最终回答（answer_delta 增量追加） */
  content: string
  /** 思考过程（thinking_delta 增量追加，可折叠展示） */
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

// ---------------- 状态 ----------------

const router = useRouter()
const hostsStore = useHostsStore()

const messages = ref<UiMessage[]>([])
const conversations = ref<Conversation[]>([])
const currentConversationId = ref<string | null>(null)
const selectedHostId = ref('')
const draft = ref('')
const streaming = ref(false)
const channelError = ref<string | null>(null)
const connectionState = ref<WsConnectionState>('disconnected')
const statusText = ref('未连接')
const messageListEl = ref<HTMLElement | null>(null)

let channel: WsChannel<AiStream, AiStream> | null = null
let unsubscribeMessage: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

// ---------------- 生命周期 ----------------

onMounted(async () => {
  channel = createAiChannel()
  unsubscribeMessage = channel.onMessage(handleAiStream)
  unsubscribeState = channel.onStateChange(handleStateChange)
  channel.connect()

  hostsStore.fetchHosts()
  await initConversations()
})

onBeforeUnmount(() => {
  unsubscribeMessage?.()
  unsubscribeMessage = null
  unsubscribeState?.()
  unsubscribeState = null
  channel?.disconnect()
  channel = null
})

function handleStateChange(state: WsConnectionState): void {
  connectionState.value = state
  statusText.value = state === 'connected' ? '已连接' : state === 'connecting' ? '连接中...' : '已断开'
}

/** 拉取会话列表并自动选中最近更新的会话加载历史（多轮上下文延续） */
async function initConversations(): Promise<void> {
  try {
    conversations.value = await conversationsApi.listConversations()
    if (conversations.value.length > 0) {
      const latest = [...conversations.value].sort((a, b) => convTime(b) - convTime(a))[0]
      await selectConversation(latest.id)
    }
  } catch (e) {
    channelError.value = `加载会话列表失败：${e instanceof Error ? e.message : String(e)}`
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
    // 仅渲染 user/assistant 两类角色；工具调用明细已内嵌于 assistant.toolCalls（R18）
    messages.value = history.items
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map(fromHistoryMessage)
    scrollToBottom()
  } catch (e) {
    channelError.value = `加载历史消息失败：${e instanceof Error ? e.message : String(e)}`
  }
}

/** REST 历史 Message（generated 类型）→ UI 视图模型 */
function fromHistoryMessage(m: Message): UiMessage {
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content ?? '',
    thinking: m.thinkingContent ?? '',
    toolCalls: (m.toolCalls ?? []).map((tc) => ({
      toolName: tc.toolName,
      toolParams: tc.toolParams ?? {},
      // WHY: 历史记录无 auto 字段，按契约语义推断——携带 approval_id 即副作用工具（须审批）
      auto: tc.approvalId == null,
      approvalId: tc.approvalId,
      resultStatus: tc.resultStatus,
      result: tc.result,
    })),
  }
}

function onConversationChange(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  if (id) {
    void selectConversation(id)
  }
}

function newConversation(): void {
  currentConversationId.value = null
  messages.value = []
  streaming.value = false
  channelError.value = null
}

// ---------------- 发送（Q2 裁定：ai_stream type=user_message） ----------------

async function send(): Promise<void> {
  const text = draft.value.trim()
  if (!text || streaming.value) return

  if (!channel || channel.state !== 'connected') {
    channelError.value = 'AI 通道未连接，请稍后重试'
    return
  }
  channelError.value = null
  draft.value = ''

  // 首次提问时惰性创建会话（避免产生大量空会话），后续多轮在同一会话内延续
  if (!currentConversationId.value) {
    try {
      const conv = await conversationsApi.createConversation({
        conversationCreate: selectedHostId.value ? { hostId: selectedHostId.value } : {},
      })
      currentConversationId.value = conv.id
      conversations.value = [...conversations.value, conv]
    } catch (e) {
      channelError.value = `创建会话失败：${e instanceof Error ? e.message : String(e)}`
      draft.value = text
      return
    }
  }

  messages.value.push({ id: nextUiId(), role: 'user', content: text, thinking: '', toolCalls: [] })
  // 预置空的 assistant 消息承接本回合的流式增量
  messages.value.push({ id: nextUiId(), role: 'assistant', content: '', thinking: '', toolCalls: [] })
  streaming.value = true
  scrollToBottom()

  channel.send({
    type: AiStreamType.UserMessage,
    conversation_id: currentConversationId.value,
    content: text,
    // Q7 裁定：host_id 可选，未指定时不携带该字段
    ...(selectedHostId.value ? { host_id: selectedHostId.value } : {}),
  })
}

// ---------------- 接收 ai_stream ----------------

function handleAiStream(msg: AiStream): void {
  // 多会话防串扰：只处理当前会话的消息
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
    default:
      break
  }
}

/** 取当前回合的 assistant 消息（不存在则创建，容忍服务器先发增量后建回合的边界） */
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

/**
 * tool_result 回填：契约的 ToolCallEvent 无独立 call_id，按 approval_id 优先、
 * 其次"最后一个未落结果的条目"匹配（同一回合内工具调用按序执行，该策略足够且无歧义）
 */
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

/** 错误码中文兜底文案（服务器已带 message 时优先用服务器文案） */
function defaultErrorText(code: ErrorCode | undefined): string {
  switch (code) {
    case ErrorCode.ApiKeyMissing:
      return '请先在设置中配置模型 api key'
    case ErrorCode.ModelEndpointUnreachable:
      return '模型端点不可达，请检查模型配置'
    case ErrorCode.ModelEndpointError:
      return '模型端点返回错误，请稍后重试'
    default:
      return 'AI 请求处理出错'
  }
}

function gotoSettings(): void {
  void router.push('/settings')
}

// ---------------- 展示辅助 ----------------

function formatParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params, null, 2)
  } catch {
    return String(params)
  }
}

/** 工具结果状态中文标签（command-approval「输出约束」、ai-agent「操作透明性」） */
function resultLabel(status: ToolResultStatus): string {
  switch (status) {
    case 'success':
      return '执行成功'
    case 'rejected':
      return '用户已拒绝'
    case 'execution_timeout':
      return '执行超时'
    case 'output_truncated':
      return '输出已截断'
    case 'error':
      return '执行出错'
    default:
      return String(status)
  }
}

function resultBadgeClass(status: ToolResultStatus): string {
  return status === 'success' ? 'badge-ok' : 'badge-bad'
}

function scrollToBottom(): void {
  void nextTick(() => {
    const el = messageListEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
</script>

<style scoped>
.ai-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
}
.chat-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.chat-header h1 {
  font-size: 1.25rem;
  margin-right: auto;
}
.conversation-select,
.host-select,
.chat-header button {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
}
.status {
  font-size: 0.85rem;
  color: #89b4fa;
}
.status[data-state='disconnected'] {
  color: #f38ba8;
}
.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 8px;
  padding: 1rem;
  min-height: 300px;
}
.message[data-role='user'] {
  align-self: flex-end;
  max-width: 80%;
}
.message[data-role='assistant'] {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.user-bubble {
  background: #89b4fa;
  color: #11111b;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  white-space: pre-wrap;
}
.thinking-block {
  border: 1px dashed #585b70;
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  color: #a6adc8;
  font-size: 0.875rem;
}
.thinking-block summary {
  cursor: pointer;
  color: #cba6f7;
}
.thinking-text {
  white-space: pre-wrap;
  margin-top: 0.4rem;
}
.tool-calls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tool-call {
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  background: #1e1e2e;
  font-size: 0.875rem;
}
.tool-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tool-name {
  font-family: Consolas, monospace;
  color: #f9e2af;
}
.badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #313244;
  color: #bac2de;
}
.badge-auto {
  background: #1e3a2f;
  color: #a6e3a1;
}
.badge-pending {
  background: #45371e;
  color: #fab387;
}
.badge-manual {
  background: #2d2a45;
  color: #cba6f7;
}
.badge-ok {
  background: #1e3a2f;
  color: #a6e3a1;
}
.badge-bad {
  background: #45272d;
  color: #f38ba8;
}
.tool-params,
.tool-result-text {
  margin-top: 0.4rem;
  background: #11111b;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  color: #94e2d5;
  font-family: Consolas, monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
.answer-block {
  white-space: pre-wrap;
  line-height: 1.6;
}
.error-banner {
  color: #f38ba8;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.error-banner button {
  background: #f38ba8;
  color: #11111b;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.75rem;
  cursor: pointer;
}
.input-bar {
  display: flex;
  gap: 0.5rem;
}
.input-bar textarea {
  flex: 1;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  resize: vertical;
  font-family: inherit;
}
.input-bar button {
  align-self: stretch;
  padding: 0 1.5rem;
  background: #89b4fa;
  color: #11111b;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
}
.input-bar button:disabled {
  background: #45475a;
  color: #a6adc8;
  cursor: not-allowed;
}
</style>
