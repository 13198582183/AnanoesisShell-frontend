<template>
  <div class="approval-modal-host">
    <!-- 审批模态框：呈现 AI 分析 + 待执行命令 + 目标服务器（command-approval「执行前人工审批」） -->
    <div v-if="request" class="modal-overlay" data-region="approval-modal">
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="命令审批">
        <h2>命令审批请求</h2>

        <div class="field">
          <span class="label">目标服务器</span>
          <span data-field="hostLabel">{{ hostLabelText }}</span>
        </div>

        <div class="field">
          <span class="label">工具</span>
          <span data-field="toolName">{{ request.tool_name }}</span>
        </div>

        <div class="field column">
          <span class="label">待执行命令</span>
          <code class="command" data-field="command">{{ commandText }}</code>
        </div>

        <div class="field column">
          <span class="label">AI 分析说明</span>
          <p class="analysis" data-field="aiAnalysis">{{ request.ai_analysis }}</p>
        </div>

        <div class="field">
          <span v-if="remainingSeconds !== null" class="countdown" data-field="countdown">
            剩余 {{ remainingSeconds }} 秒
          </span>
        </div>

        <div class="actions">
          <button type="button" class="btn-approve" data-action="approve" @click="decide('approve')">
            执行
          </button>
          <button type="button" class="btn-cancel" data-action="cancel" @click="decide('cancel')">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 超时兜底提示（command-approval「审批超时自动取消」）：弹框自动关闭后向用户明示结果 -->
    <div v-if="timeoutNotice" class="timeout-notice" data-region="timeout-notice">
      审批超时，已自动取消
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createApprovalChannel, type WsChannel } from '@/ws'
import {
  ApprovalDecision,
  type ApprovalRequest,
  type ApprovalResponse,
} from '@/types'

/**
 * 审批弹框组件（task 8.6）
 *
 * WHY: 严格对齐冻结契约 asyncapi.yaml /approval 通道——组件挂载后建立独立的
 * approval WS 连接，接收 approval_request 弹出模态框（呈现 AI 分析说明、待执行命令、
 * 目标服务器，供用户判断，command-approval「执行前人工审批」）；用户点击「执行」/「取消」
 * 分别回送 approval_response(decision=approve/cancel)。
 *
 * 超时语义（Q1–Q8 冻结裁定 + 契约注记）：超时未决由**后端**自动按取消处理且
 * "不经此通道回送"，因此前端倒计时归零时只关闭弹框并提示「审批超时，已自动取消」，
 * MUST NOT 发送 approval_response，避免与后端的自动取消产生重复决策。
 *
 * 该组件挂载在 App.vue 全局壳中：副作用命令（run_command）可能在用户浏览任意页面时
 * 由智能体流程触发，弹框必须全局可见，不能只在 AI 对话页生效。
 */

const request = ref<ApprovalRequest | null>(null)
const remainingSeconds = ref<number | null>(null)
const timeoutNotice = ref(false)

let channel: WsChannel<ApprovalResponse, ApprovalRequest> | null = null
let unsubscribeMessage: (() => void) | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 目标服务器展示名：优先契约便捷字段 host_label，缺失时退回 host_id */
const hostLabelText = computed(() => request.value?.host_label ?? request.value?.host_id ?? '')

/** 待执行命令：优先契约便捷字段 command，缺失时从 tool_params.command 提取（二者等价） */
const commandText = computed(() => {
  const r = request.value
  if (!r) return ''
  if (r.command) return r.command
  const fromParams = r.tool_params?.command
  return typeof fromParams === 'string' ? fromParams : JSON.stringify(r.tool_params)
})

onMounted(() => {
  channel = createApprovalChannel()
  unsubscribeMessage = channel.onMessage(handleApprovalRequest)
  channel.connect()
})

onBeforeUnmount(() => {
  stopCountdown()
  unsubscribeMessage?.()
  unsubscribeMessage = null
  channel?.disconnect()
  channel = null
})

function handleApprovalRequest(msg: ApprovalRequest): void {
  request.value = msg
  // 新请求到达时清除上一条的超时提示，避免旧提示干扰本次决策
  timeoutNotice.value = false
  startCountdown(msg.timeout_seconds)
}

/**
 * 用户决策：回送 approval_response 并关闭弹框。
 * WHY: decision 取值严格使用契约枚举 ApprovalDecision（approve/cancel），不手写字符串。
 */
function decide(decision: ApprovalDecision): void {
  const current = request.value
  if (!current) return
  stopCountdown()
  if (channel && channel.state === 'connected') {
    channel.send({ approval_id: current.approval_id, decision })
  }
  request.value = null
}

/**
 * 启动倒计时（timeout_seconds 为 null/缺失时不启动，弹框持续等待用户决策）
 */
function startCountdown(timeoutSeconds: number | null | undefined): void {
  stopCountdown()
  if (timeoutSeconds == null) {
    remainingSeconds.value = null
    return
  }
  remainingSeconds.value = timeoutSeconds
  countdownTimer = setInterval(() => {
    if (remainingSeconds.value === null) return
    remainingSeconds.value -= 1
    if (remainingSeconds.value <= 0) {
      // 超时兜底：关闭弹框并提示；后端会独立计时并自动按取消处理，前端不回送响应
      stopCountdown()
      request.value = null
      timeoutNotice.value = true
    }
  }, 1000)
}

function stopCountdown(): void {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  remainingSeconds.value = null
}
</script>

<style scoped>
.approval-modal-host {
  position: relative;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 17, 27, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-card {
  width: min(560px, calc(100vw - 2rem));
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.modal-card h2 {
  font-size: 1.1rem;
  color: #f9e2af;
}
.field {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.field.column {
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  color: #a6adc8;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.command {
  display: block;
  width: 100%;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  color: #a6e3a1;
  font-family: Consolas, 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.analysis {
  color: #cdd6f4;
  line-height: 1.6;
  white-space: pre-wrap;
}
.countdown {
  color: #fab387;
  font-size: 0.9rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.actions button {
  padding: 0.4rem 1.25rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
}
.btn-approve {
  background: #a6e3a1;
  color: #11111b;
}
.btn-cancel {
  background: #45475a;
  color: #cdd6f4;
}
.timeout-notice {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: #302d41;
  border: 1px solid #f38ba8;
  color: #f38ba8;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  z-index: 1001;
}
</style>
