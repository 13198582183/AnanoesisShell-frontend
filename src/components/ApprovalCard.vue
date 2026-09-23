<template>
  <div class="approval-card-container" v-if="request">
    <!--
      审批弹窗组件（非阻断浮动卡片·OrcaTerm 风格）

      WHY 呈现化重构：此前本组件自持一条 /approval WS 连接，与 WorkspaceView 的审批通道
      重复订阅同一 approval_request，导致「同一审批弹两次 + 空命令卡片」。现改为纯展示：
      - 连接与决策回送统一由 WorkspaceView 持有（单一 /approval 通道）；
      - 本组件只接收当前待审批 request（props），把用户决策（含倒计时归零）以事件抛回父级；
      - MUST NOT 自行发送 approval_response，避免与后端产生重复决策。
      卡片悬浮右下角、状态栏上方，不遮挡终端主区域，用户可边审批边操作终端。
    -->
    <div class="approval-card" role="alert" data-region="approval-card" v-if="request">
      <div class="card-header">
        <span class="card-icon">⚠</span>
        <span class="card-title">命令审批</span>
        <span v-if="remainingSeconds !== null" class="card-countdown" data-field="countdown">
          {{ remainingSeconds }}s
        </span>
      </div>

      <div class="card-body">
        <div class="card-field">
          <span class="field-label">服务器</span>
          <span class="field-value" data-field="hostLabel">{{ hostLabelText }}</span>
        </div>

        <div class="card-field">
          <span class="field-label">工具</span>
          <span class="field-value field-mono" data-field="toolName">{{ request.tool_name }}</span>
        </div>

        <div class="card-field card-field-column">
          <span class="field-label">命令</span>
          <template v-if="status === 'modifying'">
            <input
              v-model="modifiedCommand"
              class="field-command-input"
              data-field="modifiedCommand"
              :placeholder="commandText"
            />
          </template>
          <code v-else class="field-command" data-field="command">{{ commandText }}</code>
        </div>

        <div v-if="request.ai_analysis" class="card-field card-field-column">
          <span class="field-label">AI 分析</span>
          <p class="field-analysis" data-field="aiAnalysis">{{ request.ai_analysis }}</p>
        </div>
      </div>

      <div class="card-actions">
        <template v-if="status === 'pending'">
          <button type="button" class="btn-approve" data-action="approve" @click="decide('approve')">
            执行
          </button>
          <button type="button" class="btn-modify" data-action="modify" @click="enterModify()">
            修改
          </button>
          <button type="button" class="btn-cancel" data-action="cancel" @click="decide('cancel')">
            取消
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn-approve"
            data-action="confirm-modify"
            @click="confirmModify()"
          >
            确认修改
          </button>
          <button type="button" class="btn-cancel" data-action="cancel-modify" @click="cancelModify()">
            返回
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ApprovalDecision, type ApprovalRequest } from '@/types'

/**
 * 审批弹窗（纯展示 + 决策事件）。
 * 决策载荷回传给父级（WorkspaceView）由其经单一 /approval 通道发送 approval_response。
 */

const props = defineProps<{
  /** 当前待审批请求；为 null 时不渲染卡片 */
  request: ApprovalRequest | null
}>()

const emit = defineEmits<{
  /** 用户决策：approve/cancel/modify（modify 携带改写后的命令与期望版本） */
  decide: [
    payload: {
      approvalId: string
      decision: ApprovalDecision
      modifiedCommand?: string
      expectedVersion?: number
    },
  ]
  /** 前端倒计时归零：仅通知父级关闭展示（父级向终端写超时留痕），不发送决策（超时以服务端为准） */
  timeout: [approvalId: string]
}>()

/** 卡片内交互态：待决策 / 修改中 */
const status = ref<'pending' | 'modifying'>('pending')
const modifiedCommand = ref('')
const remainingSeconds = ref<number | null>(null)
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 目标服务器展示名：优先契约便捷字段 host_label，缺失时退回 host_id */
const hostLabelText = computed(() => props.request?.host_label ?? props.request?.host_id ?? '')

/** 待执行命令：优先契约便捷字段 command，缺失时从 tool_params.command 提取，再退化为序列化参数 */
const commandText = computed(() => {
  const r = props.request
  if (!r) return ''
  if (r.command) return r.command
  const fromParams = r.tool_params?.command
  return typeof fromParams === 'string' ? fromParams : JSON.stringify(r.tool_params)
})

// WHY: request 变化（切换到下一条待审批）时重置卡片内部态并重启倒计时
watch(
  () => props.request?.approval_id,
  () => {
    status.value = 'pending'
    modifiedCommand.value = ''
    if (props.request) {
      startCountdown(props.request.timeout_seconds)
    } else {
      stopCountdown()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopCountdown()
})

function decide(decision: ApprovalDecision): void {
  const r = props.request
  if (!r) return
  // approve/cancel 是终局裁决：停倒计时防归零后误发 timeout（父级出队后卡片即隐）
  stopCountdown()
  emit('decide', { approvalId: r.approval_id, decision, expectedVersion: r.version })
}

function enterModify(): void {
  status.value = 'modifying'
  modifiedCommand.value = commandText.value
}

function confirmModify(): void {
  const r = props.request
  if (!r) return
  const cmd = modifiedCommand.value.trim()
  if (!cmd) return
  // WHY 不停止倒计时：后端 gate.modify 不重置超时（防反复续期），
  //     修改后审批仍挂起等待用户对新命令点「执行」，倒计时应连续
  // WHY: modify 携带 expectedVersion，后端据此拒绝基于旧版本的参数替换（design D5）
  emit('decide', {
    approvalId: r.approval_id,
    decision: ApprovalDecision.Modify,
    modifiedCommand: cmd,
    expectedVersion: r.version,
  })
  // 回到待决策态：父级会就地更新 request 快照（新命令/新版本），
  // 卡片继续展示修改后的命令等待用户点「执行」
  status.value = 'pending'
  modifiedCommand.value = ''
}

function cancelModify(): void {
  status.value = 'pending'
  modifiedCommand.value = ''
}

/** 启动倒计时（timeout_seconds 为 null/缺失时不启动，不展示倒计时） */
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
      // WHY: 归零只自毁倒计时并通知父级出队，不在卡片内展示超时态——
      //      超时提示由父级以终端留痕行承载（留痕是单一事实源，避免 UI 双轨）
      stopCountdown()
      const r = props.request
      if (r) emit('timeout', r.approval_id)
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
.approval-card-container {
  position: fixed;
  /* WHY bottom 抬高到模式条+状态栏之上：弹窗不得遮挡底部 Shell/Agent/文件站开关 */
  bottom: 68px;
  right: 16px;
  z-index: 1000;
  max-width: 420px;
  width: calc(100vw - 80px);
}

.approval-card {
  background: #161b22;
  border: 1px solid #f0883e;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #1c2128;
  border-bottom: 1px solid #30363d;
}

.card-icon {
  font-size: 14px;
  color: #f0883e;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #c9d1d9;
  flex: 1;
}

.card-countdown {
  font-size: 12px;
  color: #f0883e;
  font-variant-numeric: tabular-nums;
  background: #f0883e1a;
  padding: 2px 8px;
  border-radius: 10px;
}

.card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.card-field-column {
  flex-direction: column;
  align-items: stretch;
}

.field-label {
  color: #8b949e;
  flex-shrink: 0;
  min-width: 48px;
}

.field-value {
  color: #c9d1d9;
}

.field-mono {
  font-family: 'SF Mono', Consolas, monospace;
  color: #d2a8ff;
}

.field-command {
  display: block;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 6px 10px;
  color: #c9d1d9;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.field-command-input {
  background: #0d1117;
  border: 1px solid #58a6ff;
  border-radius: 4px;
  padding: 6px 10px;
  color: #c9d1d9;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  outline: none;
}

.field-analysis {
  color: #8b949e;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #30363d;
  justify-content: flex-end;
}

.card-actions button {
  padding: 5px 16px;
  border-radius: 6px;
  border: 1px solid #30363d;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-approve {
  background: #238636;
  color: #ffffff;
  border-color: #238636 !important;
}

.btn-approve:hover {
  background: #2ea043;
}

.btn-modify {
  background: #1f6feb;
  color: #ffffff;
  border-color: #1f6feb !important;
}

.btn-modify:hover {
  background: #388bfd;
}

.btn-cancel {
  background: #21262d;
  color: #c9d1d9;
}

.btn-cancel:hover {
  background: #30363d;
}
</style>
