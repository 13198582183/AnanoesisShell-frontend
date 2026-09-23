<template>
  <div class="conversation-history" data-history-panel>
    <!-- 对话列表侧栏 -->
    <div class="conv-list" data-conversation-list>
      <div class="list-header">
        <h3>历史对话</h3>
        <button
          v-if="!readOnly && selectedIds.size > 0"
          data-action="batch-delete"
          class="batch-delete-btn"
          @click="showBatchDeleteConfirm = true"
        >
          删除选中 ({{ selectedIds.size }})
        </button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="conversations.length === 0" class="empty">暂无对话记录</div>

      <ul v-else class="conv-items">
        <li
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conv-item', { active: activeConvId === conv.id }]"
          :data-conversation="conv.id"
          @click="selectConversation(conv.id)"
        >
          <label v-if="!readOnly" class="select-label" @click.stop>
            <input
              type="checkbox"
              :data-select="conv.id"
              :checked="selectedIds.has(conv.id)"
              @change="toggleSelect(conv.id)"
            />
          </label>
          <span class="conv-title">{{ conv.title || conv.id }}</span>
        </li>
      </ul>
    </div>

    <!-- 消息展示区 -->
    <div class="message-area" data-message-area>
      <div v-if="activeConvId && messagesLoading" class="loading">加载消息中...</div>
      <div v-else-if="!activeConvId" class="empty">选择一个对话查看消息</div>
      <div v-else-if="messages.length === 0" class="empty">该对话暂无消息</div>

      <template v-else>
        <div
          v-for="msg in messages"
          :key="msg.id"
          :data-message="msg.id"
          :class="['message', `role-${msg.role}`]"
        >
          <div class="msg-header">
            <span class="msg-role">{{ msg.role }}</span>
            <span v-if="msg.source" class="msg-source" :data-source="msg.source">{{ msg.source }}</span>
            <span v-if="msg.runId" class="msg-run-id">run: {{ msg.runId }}</span>
          </div>
          <div class="msg-content">{{ msg.content }}</div>
          <!-- 工具调用记录 -->
          <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="tool-calls" data-tool-calls>
            <div v-for="(tc, idx) in msg.toolCalls" :key="idx" class="tool-call">
              <span class="tool-name">{{ tc.toolName }}</span>
              <span class="tool-status">{{ tc.resultStatus }}</span>
              <pre v-if="tc.result" class="tool-result">{{ tc.result }}</pre>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <button
          v-if="hasMore"
          data-action="load-more"
          class="load-more-btn"
          :disabled="messagesLoading"
          @click="loadMore"
        >
          {{ messagesLoading ? '加载中...' : '加载更多' }}
        </button>
      </template>

      <!-- 操作按钮 -->
      <div v-if="activeConvId && !readOnly" class="conv-actions">
        <button data-action="continue" @click="emit('continue', activeConvId)">继续此对话</button>
        <button data-action="delete" class="delete-btn" @click="showDeleteConfirm = true">删除</button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error" data-error>{{ error }}</div>
    </div>

    <!-- 单删确认对话框 -->
    <div v-if="showDeleteConfirm" data-confirm-dialog class="confirm-dialog">
      <p>确认删除此对话？</p>
      <p v-if="conflictError" class="error">请先停止运行中任务</p>
      <button data-action="confirm-delete" @click="confirmDelete">确认删除</button>
      <button data-action="cancel-delete" @click="showDeleteConfirm = false">取消</button>
    </div>

    <!-- 批删确认对话框 -->
    <div v-if="showBatchDeleteConfirm" data-confirm-dialog class="confirm-dialog">
      <p>确认删除选中的 {{ selectedIds.size }} 个对话？</p>
      <p v-if="conflictError" class="error">请先停止运行中任务</p>
      <button data-action="confirm-delete" @click="confirmBatchDelete">确认删除</button>
      <button data-action="cancel-delete" @click="showBatchDeleteConfirm = false">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { conversationsApi } from '@/api'
import type { Conversation, Message } from '@/api'

/**
 * 历史对话面板（task 11.1 + 11.2）
 *
 * WHY（请求代次校验）：
 * - 用户快速切换对话时，前一个请求的响应可能晚于后一个请求。
 * - 使用递增的 generation 计数器，每次切换对话时递增，
 *   响应到达时比对 generation，不匹配则丢弃，防止数据污染。
 *
 * WHY（readOnly 模式）：
 * - 关闭连接或无 session 时，历史仅供查看，不显示删除/继续操作。
 *
 * WHY（删除当前对话 → 空白状态）：
 * - 删除当前查看的对话后，清空消息列表并回到空白状态，
 *   不自动发问（不 emit send），让用户主动选择下一步操作。
 */
const props = defineProps<{
  sessionId: string | null
  readOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'continue', conversationId: string): void
}>()

const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])
const loading = ref(false)
const messagesLoading = ref(false)
const activeConvId = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const error = ref<string | null>(null)
const conflictError = ref(false)
const selectedIds = ref(new Set<string>())
const showDeleteConfirm = ref(false)
const showBatchDeleteConfirm = ref(false)

// WHY: 请求代次计数器，防止快速切换时晚到响应污染当前状态
let generation = 0

async function fetchConversations() {
  loading.value = true
  error.value = null
  try {
    conversations.value = await conversationsApi.listConversations()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    conversations.value = []
  } finally {
    loading.value = false
  }
}

async function selectConversation(convId: string) {
  activeConvId.value = convId
  messages.value = []
  nextCursor.value = null
  hasMore.value = false
  error.value = null

  // WHY: 递增 generation，使前一个请求的响应在到达时自动被丢弃
  const currentGen = ++generation

  messagesLoading.value = true
  try {
    const resp = await conversationsApi.listConversationMessages({
      id: convId,
      cursor: undefined,
      limit: 30,
    })
    // WHY: 代次校验——如果切换后 generation 已变，丢弃迟到的响应
    if (currentGen !== generation) return
    messages.value = resp.items
    nextCursor.value = resp.nextCursor
    hasMore.value = resp.hasMore
  } catch (e) {
    if (currentGen !== generation) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (currentGen === generation) {
      messagesLoading.value = false
    }
  }
}

async function loadMore() {
  if (!activeConvId.value || !hasMore.value || !nextCursor.value) return

  const currentGen = generation
  messagesLoading.value = true
  try {
    const resp = await conversationsApi.listConversationMessages({
      id: activeConvId.value,
      cursor: nextCursor.value,
      limit: 30,
    })
    if (currentGen !== generation) return
    // WHY: 保序追加——新消息接在已有消息之后
    messages.value = [...messages.value, ...resp.items]
    nextCursor.value = resp.nextCursor
    hasMore.value = resp.hasMore
  } catch (e) {
    if (currentGen !== generation) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (currentGen === generation) {
      messagesLoading.value = false
    }
  }
}

function toggleSelect(convId: string) {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(convId)) {
    newSet.delete(convId)
  } else {
    newSet.add(convId)
  }
  selectedIds.value = newSet
}

async function confirmDelete() {
  if (!activeConvId.value) return
  conflictError.value = false
  try {
    await conversationsApi.deleteConversation({ id: activeConvId.value })
    showDeleteConfirm.value = false
    // WHY: 删除当前对话后回到空白状态，不自动发问
    activeConvId.value = null
    messages.value = []
    await fetchConversations()
  } catch (e) {
    // WHY: 409 表示对话仍在运行中，需先停止任务
    if (e instanceof Error && e.message.includes('409')) {
      conflictError.value = true
    } else {
      error.value = e instanceof Error ? e.message : String(e)
      showDeleteConfirm.value = false
    }
  }
}

async function confirmBatchDelete() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  conflictError.value = false
  try {
    await conversationsApi.batchDeleteConversations({
      batchDeleteRequest: { ids: ids.slice(0, 100) },
    })
    showBatchDeleteConfirm.value = false
    selectedIds.value = new Set()
    // WHY: 如果当前查看的对话被删除，回到空白状态
    if (activeConvId.value && ids.includes(activeConvId.value)) {
      activeConvId.value = null
      messages.value = []
    }
    await fetchConversations()
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) {
      conflictError.value = true
    } else {
      error.value = e instanceof Error ? e.message : String(e)
      showBatchDeleteConfirm.value = false
    }
  }
}

// 挂载时加载对话列表
fetchConversations()
</script>

<style scoped>
.conversation-history {
  display: flex;
  height: 100%;
  gap: 1rem;
}
.conv-list {
  width: 240px;
  border-right: 1px solid #45475a;
  overflow-y: auto;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
}
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}
.conv-items {
  list-style: none;
  padding: 0;
  margin: 0;
}
.conv-item {
  padding: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.conv-item.active {
  background: #313244;
}
.conv-item:hover {
  background: #45475a;
}
.message {
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
}
.role-user {
  background: #1e1e2e;
}
.role-assistant {
  background: #313244;
}
.msg-header {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #a6adc8;
}
.tool-calls {
  margin-top: 0.5rem;
  padding: 0.25rem;
  background: #1e1e2e;
  border-radius: 4px;
  font-size: 0.75rem;
}
.tool-call {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.tool-name {
  color: #89b4fa;
}
.conv-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
.confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1e1e2e;
  padding: 1rem;
  border: 1px solid #45475a;
  border-radius: 8px;
  z-index: 100;
}
.error {
  color: #f38ba8;
  font-size: 0.875rem;
}
.loading,
.empty {
  color: #a6adc8;
  padding: 1rem;
}
button {
  padding: 0.375rem 0.875rem;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}
.delete-btn {
  background: #f38ba8;
  color: #1e1e2e;
  border-color: #f38ba8;
}
</style>
