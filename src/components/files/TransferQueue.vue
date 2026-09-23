<template>
  <div class="transfer-queue" data-transfer-queue>
    <h3>传输队列</h3>

    <div v-if="transfers.length === 0" class="empty">暂无传输任务</div>

    <div
      v-for="task in transfers"
      :key="task.id"
      :data-task="task.id"
      :class="['transfer-item', `status-${task.status}`]"
    >
      <div class="task-header">
        <span class="file-name">{{ task.fileName }}</span>
        <span :class="['status-badge', `status-${task.status}`]">{{ task.status }}</span>
      </div>

      <div class="task-path">{{ task.remotePath }}</div>

      <!-- 进度显示 -->
      <div v-if="isActiveStatus(task.status)" class="progress-area">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: progressPercent(task) + '%' }"
          ></div>
        </div>
        <span class="progress-text">
          {{ task.bytesTransferred }} / {{ task.totalBytes }} bytes
          ({{ progressPercent(task) }}%)
        </span>
      </div>

      <!-- 下载完成文案 -->
      <div v-if="task.direction === 'download' && task.status === 'delivered'" class="download-done" data-download-done>
        已交给浏览器
      </div>

      <!-- 错误信息 -->
      <div v-if="task.failureMessage" class="error-message" data-error>
        <span v-if="task.failureCode === 'concurrent_modification'" class="concurrent-warning">
          ⚠ 并发修改风险：{{ task.failureMessage }}
        </span>
        <span v-else>{{ task.failureMessage }}</span>
      </div>

      <!-- 覆盖确认 -->
      <div v-if="getOverwriteCandidate(task)" class="overwrite-confirm" data-overwrite>
        <p>目标已存在同名文件，确认覆盖？</p>
        <button
          data-action="confirm-overwrite"
          @click="emit('overwrite-confirm', task.id)"
        >
          确认覆盖
        </button>
      </div>

      <!-- 操作按钮 -->
      <div class="task-actions">
        <button
          v-if="isCancellable(task.status)"
          data-action="cancel"
          @click="handleCancel(task.id)"
        >
          取消
        </button>
        <!-- WHY: unknown 状态不自动重试，不提供重试按钮 -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { transfersApi } from '@/api'
import type { Transfer } from '@/api'

/**
 * 传输队列面板（task 14.5 + 14.6）
 *
 * WHY（发送进度 vs 远端写入进度分离）：
 * - 上传时 XHR 报告的 progress 是"发送进度"（数据离开浏览器的进度），
 *   而 Transfer.bytesTransferred 是"远端写入进度"（SFTP 服务端确认写入的进度）。
 * - 两者可能不同步（网络缓冲、服务端延迟），分开显示让用户了解真实状态。
 *
 * WHY（每秒轮询活动任务）：
 * - 活动任务（queued/ready/transferring/publishing）需要定期检查状态更新。
 * - 终态（published/delivered/failed/cancelled/expired）不再轮询，释放资源。
 *
 * WHY（取消不提前宣称成功）：
 * - 取消后状态变为 cancelled，不应显示"完成"文案。
 *
 * WHY（下载完成文案"已交给浏览器"）：
 * - 下载通过附件导航实现，前端无法追踪浏览器下载进度，
 *   只能确认"已触发下载"，文案如实反映。
 *
 * WHY（键盘可达性）：
 * - 所有操作按钮使用原生 <button>，天然支持 Tab/Enter/Space 键盘操作。
 */
const props = defineProps<{
  transfers: Transfer[]
  sessionId: string
  controlToken: string
  overwriteCandidates?: Array<{ fileName: string; size: number; mtime: Date; mode: string }>
}>()

const emit = defineEmits<{
  (e: 'cancel', transferId: string): void
  (e: 'overwrite-confirm', transferId: string): void
  (e: 'update', transfer: Transfer): void
}>()

// WHY: 终态集合——这些状态不再轮询
const TERMINAL_STATUSES = new Set(['published', 'delivered', 'failed', 'cancelled', 'expired'])

function isActiveStatus(status: string): boolean {
  return ['queued', 'ready', 'transferring', 'publishing'].includes(status)
}

function isCancellable(status: string): boolean {
  return ['queued', 'ready', 'transferring', 'publishing'].includes(status)
}

function progressPercent(task: Transfer): number {
  if (task.totalBytes === 0) return 0
  return Math.round((task.bytesTransferred / task.totalBytes) * 100)
}

function getOverwriteCandidate(task: Transfer) {
  return props.overwriteCandidates?.find((c) => c.fileName === task.fileName)
}

async function handleCancel(transferId: string) {
  try {
    const updated = await transfersApi.cancelTransfer({ id: transferId })
    emit('update', updated)
  } catch {
    // 取消失败时不更新状态
  }
  emit('cancel', transferId)
}

// WHY: 每秒轮询活动任务状态
const pollInterval = setInterval(async () => {
  for (const task of props.transfers) {
    if (isActiveStatus(task.status)) {
      try {
        const updated = await transfersApi.getTransfer({ id: task.id })
        emit('update', updated)
      } catch {
        // 轮询失败静默处理，下次继续
      }
    }
  }
}, 1000)

onUnmounted(() => {
  clearInterval(pollInterval)
})
</script>

<style scoped>
.transfer-queue {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.transfer-item {
  padding: 0.5rem;
  border: 1px solid #45475a;
  border-radius: 4px;
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.file-name {
  font-weight: bold;
}
.status-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: #313244;
}
.status-transferring {
  color: #89b4fa;
}
.status-published,
.status-delivered {
  color: #a6e3a1;
}
.status-failed {
  color: #f38ba8;
}
.status-cancelled,
.status-expired {
  color: #6c7086;
}
.task-path {
  font-size: 0.75rem;
  color: #a6adc8;
  font-family: monospace;
}
.progress-area {
  margin-top: 0.25rem;
}
.progress-bar {
  height: 4px;
  background: #45475a;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #89b4fa;
  transition: width 0.3s;
}
.progress-text {
  font-size: 0.75rem;
  color: #a6adc8;
}
.download-done {
  color: #a6e3a1;
  font-size: 0.875rem;
}
.error-message {
  color: #f38ba8;
  font-size: 0.875rem;
}
.concurrent-warning {
  color: #f9e2af;
}
.overwrite-confirm {
  margin-top: 0.25rem;
  padding: 0.25rem;
  background: #1e1e2e;
  border-radius: 4px;
}
.task-actions {
  margin-top: 0.25rem;
  display: flex;
  gap: 0.5rem;
}
.empty {
  color: #a6adc8;
}
button {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}
</style>
