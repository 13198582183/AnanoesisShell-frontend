<template>
  <div class="workspace-view">
    <!-- 顶部 tab 条（roving tabindex，方向键导航） -->
    <div class="tab-bar" data-region="tab-bar" role="tablist">
      <button
        v-for="(ws, index) in workspaces"
        :key="ws.id"
        role="tab"
        data-role="tab"
        :class="['tab-item', { active: ws.id === effectiveActiveId }]"
        :tabindex="ws.id === effectiveActiveId ? 0 : -1"
        :aria-selected="ws.id === effectiveActiveId"
        @click="switchTab(ws.id)"
        @keydown="handleTabKeydown($event, index)"
      >
        <span class="tab-host-name">{{ ws.hostName }}</span>
        <span class="tab-status" :data-status="ws.status"></span>
        <span
          v-if="ws.pendingApprovals > 0"
          class="tab-badge"
          data-field="pending-count"
        >
          {{ ws.pendingApprovals }}
        </span>
        <button
          type="button"
          class="tab-close"
          data-action="close-tab"
          @click.stop="closeTab(ws.id)"
          :aria-label="`关闭 ${ws.hostName}`"
        >
          ×
        </button>
      </button>
      <!--
        同主机多开入口：以当前 tab 的主机新建独立连接实例
        （服务器列表的“连接”也是每次新建，这里是原地快捷入口）。
      -->
      <button
        type="button"
        class="tab-new"
        data-action="new-tab"
        title="新建连接 tab"
        @click="newTab"
      >
        +
      </button>
    </div>

    <!-- 主体：左侧 SFTP 侧边栏 + 右侧终端 -->
    <div class="workspace-body">
      <!-- 左侧可折叠 SFTP 文件站侧边栏（参照 OrcaTerm） -->
      <aside v-if="showFileSidebar" class="file-sidebar" data-region="file-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">文件站</span>
          <button type="button" class="sidebar-close-btn" @click="showFileSidebar = false">×</button>
        </div>
        <RemoteFilePanel
          v-if="activeWorkspace?.sessionId"
          :session-id="activeWorkspace.sessionId"
          :control-token="activeWorkspace.controlToken || ''"
          :initial-path="activeWorkspace.remotePath || '/'"
          @download="handleFileDownload"
          @upload="handleFileUpload"
        />
        <div v-else class="sidebar-placeholder">连接就绪后可浏览文件</div>
        <TransferQueue
          v-if="activeWorkspace?.sessionId"
          :transfers="transfers"
          :session-id="activeWorkspace.sessionId"
          :control-token="activeWorkspace.controlToken || ''"
          @update="handleTransferUpdate"
        />
      </aside>

      <!-- 中间：终端区域（每个 tab 一个独立 TerminalTimeline 实例，v-show 切换）
           WHY: 共享单实例时在 tab 切换 reset 缓冲区，会把「$ 命令 ⏳待审批」等
           留痕和用户输入一并抹掉，违反命令留痕红线；改为 per-tab 实例后
           后台 tab 的输出/留痕照常写自己的 buffer，切回不丢历史 -->
      <div class="workspace-content">
        <TerminalTimeline
          v-for="ws in workspaces"
          :key="ws.id"
          :ref="(el) => setTimelineRef(ws.id, el)"
          v-show="ws.id === effectiveActiveId"
          :active-session-id="ws.sessionId || ''"
          :mode="ws.mode"
          :disconnected="isDisconnectedStatus(ws.status)"
          :generating="!!aiStreamingByWs[ws.id]"
          @shellInput="(data: string) => handleShellInput(ws.id, data)"
          @agentInput="(text: string) => handleAgentInput(ws.id, text)"
          @resize="(cols: number, rows: number) => handleResize(ws.id, cols, rows)"
          @reconnect="reconnectWorkspace(ws.id)"
          @agentStop="stopAgentTurn(ws.id)"
        />
        <div v-if="workspaces.length === 0" class="no-workspace">
          没有活动的连接。从服务器列表创建新连接。
        </div>
      </div>
    </div>

    <!-- 底部：模式切换条（仅 Shell/Agent 切换，无输入框） -->
    <div v-if="activeWorkspace" class="mode-toggle-strip">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: activeWorkspace.mode === 'shell' }"
        @click="handleModeChange('shell')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        Shell
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: activeWorkspace.mode === 'agent' }"
        @click="handleModeChange('agent')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        Agent
      </button>
      <!-- 断线重连按钮（对标 FinalShell）：仅在会话终态（关闭/失败）出现，
           与终端内按 r 同一重连路径；连接中/已连接时隐藏避免重复 open -->
      <button
        v-if="isDisconnectedStatus(activeWorkspace.status)"
        type="button"
        class="mode-btn reconnect-btn"
        data-action="reconnect"
        title="重新建立终端会话（或按 r 键）"
        @click="reconnectWorkspace(effectiveActiveId)"
      >
        ⟳ 重连
      </button>
      <!-- WHY: 文件站开关从悬浮于终端左上角改为底部条右侧——
           悬浮按钮会遮挡终端历史文字，降低可读性 -->
      <button
        type="button"
        class="mode-btn sidebar-toggle-btn"
        :class="{ active: showFileSidebar }"
        data-action="toggle-file-sidebar"
        @click="showFileSidebar = !showFileSidebar"
        title="文件站"
      >
        📁 文件站
      </button>
      <span v-if="aiStreaming" class="streaming-indicator">
        <span class="streaming-dot"></span>
        AI 思考中...
      </span>
    </div>

    <!-- 审批浮动弹窗（非阻断）：决策经单一 /approval 通道回送，命令留痕写入终端 -->
    <ApprovalCard
      :request="currentApproval"
      @decide="onApprovalDecide"
      @timeout="onApprovalTimeout"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspacesStore, type WorkspaceStatus } from '@/stores/workspaces'
import { conversationsApi, transfersApi, transferContentApi, type Transfer, type FileEntry } from '@/api'
import {
  createTerminalChannel,
  createAiChannel,
  createApprovalChannel,
  type WsChannel,
  type WsConnectionState,
} from '@/ws'
import {
  TerminalInputAction,
  TerminalOutputType,
  AiStreamType,
  ErrorCode,
  ApprovalDecision,
  type TerminalInput,
  type TerminalOutput,
  type AiStream,
  type ApprovalRequest,
  type ApprovalResponse,
} from '@/types'
import TerminalTimeline from '@/components/terminal/TerminalTimeline.vue'
import ApprovalCard from '@/components/ApprovalCard.vue'
import RemoteFilePanel from '@/components/files/RemoteFilePanel.vue'
import TransferQueue from '@/components/files/TransferQueue.vue'

/**
 * WorkspaceView 组件（OrcaTerm 风格·弹窗审批 + 终端留痕）
 * WHY: 多 tab 工作区主视图，参照腾讯云 OrcaTerm 设计。
 *      顶部 tab 条代表一次独立连接，每个 tab 对应一个独立的 TerminalTimeline
 *      实例（v-show 切换，历史互不干扰）。所有输入在 xterm 内完成：
 *      Shell 模式直接转发到 PTY，Agent 模式内联回显后提交到 AI 通道。
 *      审批以非阻断浮动弹窗（ApprovalCard 纯展示组件）落在右下角：
 *      - 弹窗弹出时向终端写「$ 命令 ⏳待审批」留痕，决策后追加「→已批准执行/→已拒绝」状态行；
 *      - 批准命令由后端经持久 PTY 执行，输出回流同一终端（ApprovedCommandRunner PTY 路径）；
 *      - AI thinking/answer 以文本形式按时间顺序写入同一终端。
 */

// KeepAlive include 按 name 匹配：不声明则 App 壳的缓存名单永远不命中，
// 切页仍会卸载销毁连接（回归用例：WorkspaceView.spec 「KeepAlive 兼容」）
defineOptions({ name: 'WorkspaceView' })

// ==================== 路由 & Store ====================
const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspacesStore()

// ==================== 组件引用（per-tab 终端实例注册表） ====================
/**
 * 每个 workspace 一个独立的 TerminalTimeline 实例（模板 v-for + 函数 ref 收集）。
 * WHY: 命令留痕/用户输入必须随 tab 切换完整保留，共享单实例 + reset 会丢历史；
 *      写入统一经 writeToWs，后台 tab 也写自己隐藏的 buffer（切回 refit 重绘）。
 */
const timelineRefs = new Map<string, InstanceType<typeof TerminalTimeline>>()

function setTimelineRef(wsId: string, el: unknown): void {
  if (el) {
    timelineRefs.set(wsId, el as InstanceType<typeof TerminalTimeline>)
  } else {
    timelineRefs.delete(wsId)
  }
}

/** 向指定 workspace 的终端实例写入（实例不存在=已销毁，静默丢弃） */
function writeToWs(wsId: string, data: string): void {
  timelineRefs.get(wsId)?.writeToTerminal(data)
}

// ==================== 每个 workspace 的运行时状态 ====================
interface WorkspaceRuntime {
  termChannel: WsChannel<TerminalInput, TerminalOutput>
  unsubMsg: () => void
  unsubState: () => void
  aiChannel: WsChannel<AiStream, AiStream>
  aiUnsubMsg: () => void
  aiUnsubState: () => void
  /** 审批通道（单一连接）：接收 ApprovalRequest、回送 ApprovalResponse（弹窗决策经此通道） */
  approvalChannel: WsChannel<ApprovalResponse, ApprovalRequest>
  approvalUnsubMsg: () => void
  approvalUnsubState: () => void
}
const runtimeMap = new Map<string, WorkspaceRuntime>()

// ==================== Agent 模式 UI 状态 ====================
/**
 * 按 workspace 隔离的 AI 流式标志：多 tab 并发时各自的连接独立流式，
 * 一个 tab 忙不应阻塞其他 tab 输入；指示器只反映激活 tab 的状态。
 */
const aiStreamingByWs = ref<Record<string, boolean>>({})
const aiStreaming = computed(() => !!aiStreamingByWs.value[effectiveActiveId.value])

// ==================== 审批弹窗队列（按 workspace 隔离） ====================
/**
 * WHY: 同一连接可能连续产生多条待审批（AI 多工具调用），按到达顺序排队，
 *      弹窗只展示当前激活 tab 队首；非激活 tab 仅累积徽章，切回时自动弹出。
 */
const approvalQueues = ref<Record<string, ApprovalRequest[]>>({})

/** 当前弹窗展示的审批请求：激活 tab 队列队首，无则不弹窗 */
const currentApproval = computed<ApprovalRequest | null>(() => {
  const queue = approvalQueues.value[effectiveActiveId.value] ?? []
  return queue.length > 0 ? queue[0] : null
})

// ==================== SFTP 侧边栏状态 ====================
const showFileSidebar = ref(false)
const transfers = ref<Transfer[]>([])

// ==================== 路由参数 ====================
const routeWorkspaceId = computed(() => String(route.params.workspaceId ?? ''))
const workspaces = computed(() => workspaceStore.listAll())

const effectiveActiveId = computed(() => {
  const routeId = routeWorkspaceId.value
  if (routeId && workspaceStore.getById(routeId)) {
    return routeId
  }
  const all = workspaces.value
  return all.length > 0 ? all[0].id : ''
})

const activeWorkspace = computed(() => {
  const id = effectiveActiveId.value
  return id ? workspaceStore.getById(id) : undefined
})

// ==================== 生命周期 ====================
onMounted(() => {
  for (const ws of workspaceStore.listAll()) {
    if (!runtimeMap.has(ws.id)) {
      initWorkspaceRuntime(ws.id, ws.hostId)
    }
  }
})

onBeforeUnmount(() => {
  for (const [wsId] of runtimeMap) {
    disposeWorkspace(wsId)
  }
  runtimeMap.clear()
})

// KeepAlive 回活：隐藏期间容器尺寸可能变化（切页时宽度为 0），
// 回到页面必须 refit 活动 tab，否则画面尺寸错乱（与 tab 切换 watch 同一动机）
onActivated(() => {
  const id = effectiveActiveId.value
  if (id) {
    nextTick(() => timelineRefs.get(id)?.refit())
  }
})

watch(workspaces, (newList, oldList) => {
  const oldIds = new Set(oldList.map((w) => w.id))
  for (const ws of newList) {
    if (!oldIds.has(ws.id) && !runtimeMap.has(ws.id)) {
      initWorkspaceRuntime(ws.id, ws.hostId)
    }
  }
}, { deep: true })

// tab 切换：目标实例可能经历了 v-show 隐藏（容器尺寸 0，fit 失效），
// 切回时必须 refit 重算尺寸并重绘，否则切回后画面尺寸错乱
watch(effectiveActiveId, (id) => {
  if (!id) return
  nextTick(() => timelineRefs.get(id)?.refit())
})

// ==================== 初始化：WS open 建立连接 ====================
function initWorkspaceRuntime(wsId: string, hostId: string): void {
  workspaceStore.updateStatus(wsId, 'connecting')

  const termChannel = createTerminalChannel()
  // 已采纳的会话 id：用于识别新会话（首次建立/重连）与去重复用
  const runtime = { sessionId: null as string | null }

  const unsubMsg = termChannel.onMessage((msg: TerminalOutput) => {
    // WHY 恒更新（非“只认第一个”）：后端所有 data/closed 帧都携带 session_id，
    // 重连后 open 回执携带的是全新会话 id；若仅在空时采纳，重连新会话会被
    // 旧 id 阻挡，后续输入/审批路由全部失效（断线重连需求回归点）
    if (msg.session_id && msg.session_id !== runtime.sessionId) {
      runtime.sessionId = msg.session_id
      workspaceStore.setSessionId(wsId, msg.session_id)
      workspaceStore.updateStatus(wsId, 'connected')
    }
    switch (msg.type) {
      case TerminalOutputType.Data:
        // 后台 tab 的 PTY 输出也写自己实例的 buffer（切回可见，不丢历史）
        if (msg.data) writeToWs(wsId, msg.data)
        break
      case TerminalOutputType.Error:
        workspaceStore.updateStatus(wsId, 'failed')
        if (msg.message) writeToWs(wsId, `\r\n[错误] ${msg.message}\r\n`)
        break
      case TerminalOutputType.Closed:
        // 会话终结：必须清空 sessionId——残留旧 id 会让输入继续往死会话发，
        // 后端逐帧回“终端会话不存在或已结束”造成错误风暴（浏览器实测 150+ 行）
        runtime.sessionId = null
        workspaceStore.setSessionId(wsId, null)
        workspaceStore.updateStatus(wsId, 'closed')
        writeToWs(
          wsId,
          `\r\n[连接已关闭: ${msg.end_reason ?? '未知原因'}] 按 \x1b[1mr\x1b[0m 或点击“重连”重新建立会话\r\n`,
        )
        break
    }
  })

  const unsubState = termChannel.onStateChange((connState: WsConnectionState) => {
    // WHY 参数改名 connState：旧版参数名 state 遮蔽了上方 runtime 闭包，
    // 断线时无法清理已采纳的会话 id
    if (connState === 'connected') {
      // 首次建连与断线后 connect() 重建均经此路径自动补发 open
      termChannel.send({ action: TerminalInputAction.Open, host_id: hostId })
    } else if (connState === 'disconnected') {
      // WS 层整体断开（后端进程退出/网络中断）：收不到 closed 帧，
      // 在此同构处理：清会话 id + 终态 + 重连指引
      runtime.sessionId = null
      workspaceStore.setSessionId(wsId, null)
      workspaceStore.updateStatus(wsId, 'failed')
      writeToWs(wsId, '\r\n[连接已断开] 按 \x1b[1mr\x1b[0m 或点击“重连”重新建立会话\r\n')
    }
  })

  termChannel.connect()

  // AI 通道
  const aiChannel = createAiChannel()
  const aiUnsubMsg = aiChannel.onMessage((msg) => handleAiStream(wsId, msg))
  const aiUnsubState = aiChannel.onStateChange((_state) => {})
  aiChannel.connect()

  // 审批通道（统一走内嵌卡片）：接收 ApprovalRequest → 终端流内渲染卡片
  const approvalChannel = createApprovalChannel()
  const approvalUnsubMsg = approvalChannel.onMessage((msg) => handleApprovalRequest(wsId, msg))
  const approvalUnsubState = approvalChannel.onStateChange((_state) => {})
  approvalChannel.connect()

  runtimeMap.set(wsId, {
    termChannel,
    unsubMsg,
    unsubState,
    aiChannel,
    aiUnsubMsg,
    aiUnsubState,
    approvalChannel,
    approvalUnsubMsg,
    approvalUnsubState,
  })
}

/**
 * 处理 /approval 通道到达的审批请求：入队 + 终端留痕。
 * WHY: 审批统一由浮动弹窗承载（本组件持有 currentApproval），本函数只做：
 *      1) 入对应 workspace 队列（非激活 tab 仅递增徽章，切回时自动弹出）；
 *      2) 向所属 tab 终端写「$ 命令 ⏳待审批」留痕（无论后续是否执行、无论当时
 *         是否激活，命令都按到达时间顺序沉淀在该 tab 的终端历史中）；
 *      3) 防重复入队：同一 approval_id 重发（如 modify 后同 id 新版本）时替换旧项。
 */
function handleApprovalRequest(wsId: string, msg: ApprovalRequest): void {
  // WHY 按 conversation 归属过滤：/ws/approval 对所有连接广播，多 tab 时每条
  // 通道都会收到全部审批帧——不按 conversation_id 过滤，后台 tab 的审批会
  // 弹到前台终端并错加徽章
  const ws = workspaceStore.getById(wsId)
  if (!ws?.conversationId || msg.conversation_id !== ws.conversationId) return
  const queue = approvalQueues.value[wsId] ?? []
  const existed = queue.some(r => r.approval_id === msg.approval_id)
  const next = [...queue.filter(r => r.approval_id !== msg.approval_id), msg]
  approvalQueues.value = { ...approvalQueues.value, [wsId]: next }
  if (!existed) {
    workspaceStore.incrementPendingApprovals(wsId)
  }
  writeToWs(wsId, `\r\n$ ${approvalCommandText(msg)} \x1b[33m⏳待审批\x1b[0m\r\n`)
}

/** 从审批请求提取待执行命令文本（与弹窗组件同逻辑：command → tool_params.command → 序列化参数） */
function approvalCommandText(r: ApprovalRequest): string {
  if (r.command) return r.command
  const fromParams = r.tool_params?.command
  return typeof fromParams === 'string' ? fromParams : JSON.stringify(r.tool_params)
}

// ==================== Shell 输入转发 ====================
function handleShellInput(wsId: string, data: string): void {
  const ws = workspaceStore.getById(wsId)
  const rt = runtimeMap.get(wsId)
  if (!rt || !ws?.sessionId || rt.termChannel.state !== 'connected') return
  rt.termChannel.send({
    action: TerminalInputAction.Input,
    session_id: ws.sessionId,
    data,
  })
}

// ==================== Agent 输入处理 ====================
function handleAgentInput(wsId: string, text: string): void {
  const ws = workspaceStore.getById(wsId)
  if (!ws || ws.mode !== 'agent') return

  // WHY: 不再回显 [You] 前缀——TerminalTimeline 内联输入已实时回显用户文本并按 Enter 换行，
  //      此处重复回显会造成双份输入内容
  void sendAiMessage(wsId, text)
}

// ==================== 审批弹窗决策（统一回送 approval_response 到单一 /approval 通道） ====================
/**
 * 弹窗决策回调：回送后端闸门 + 终端追加状态留痕 + 出队。
 * WHY: 后端已支持经持久 PTY 执行已批准命令（ApprovedCommandRunner.run(..., sessionId)），
 *      因此前端不直接往 PTY 打字（避免绕过闸门造成审计不一致/双执行），
 *      而是回送 approval_response 由后端统一执行并把输出回流到共享终端。
 *      expected_version 防止基于旧版本的参数替换（design D5）；modify 使旧版本作废，
 *      后端会重新发起新版本审批（新请求再次到达时自动弹窗 + 写新留痕）。
 */
function onApprovalDecide(payload: {
  approvalId: string
  decision: ApprovalDecision
  modifiedCommand?: string
  expectedVersion?: number
}): void {
  const wsId = effectiveActiveId.value
  const queue = approvalQueues.value[wsId] ?? []
  const index = queue.findIndex(r => r.approval_id === payload.approvalId)
  if (index < 0) return
  const request = queue[index]

  const rt = runtimeMap.get(wsId)
  if (!rt || rt.approvalChannel.state !== 'connected') {
    writeToWs(wsId, '\r\n\x1b[31m[审批回送失败：通道未连接]\x1b[0m\r\n')
    return
  }

  const response: ApprovalResponse = { approval_id: payload.approvalId, decision: payload.decision }
  if (payload.modifiedCommand !== undefined) response.modified_command = payload.modifiedCommand
  if (payload.expectedVersion !== undefined) response.expected_version = payload.expectedVersion
  rt.approvalChannel.send(response)

  // 决策状态留痕（接在弹窗弹出时的 ⏳待审批 行之后，形成完整时间线）
  let trace: string
  if (payload.decision === ApprovalDecision.Modify) {
    // WHY 修改不出队：后端 gate.modify 只递增版本/记录新命令，不重新广播 approval_request，
    //      审批仍挂起等待用新版本批准——前端就地更新队列快照（command / version+1），
    //      弹窗继续展示修改后的命令，用户点「执行」才真正裁决；若出队则命令挂到超时
    const updated: ApprovalRequest = {
      ...request,
      command: payload.modifiedCommand ?? request.command,
      version: request.version + 1,
    }
    approvalQueues.value = {
      ...approvalQueues.value,
      [wsId]: queue.map((r, i) => (i === index ? updated : r)),
    }
    trace = `→ \x1b[33m已修改为: ${payload.modifiedCommand ?? ''}，请确认执行\x1b[0m\r\n`
    writeToWs(wsId, `\r\n${trace}`)
    return
  }
  trace =
    payload.decision === ApprovalDecision.Approve
      ? '→ \x1b[32m已批准执行\x1b[0m\r\n'
      : '→ \x1b[31m已拒绝\x1b[0m\r\n'
  writeToWs(wsId, `\r\n${trace}`)
  dequeueApproval(wsId, index)
}

/**
 * 前端倒计时归零：仅出队关弹窗并提示，MUST NOT 回送决策（超时取消以服务端为准）。
 */
function onApprovalTimeout(approvalId: string): void {
  const wsId = effectiveActiveId.value
  const queue = approvalQueues.value[wsId] ?? []
  const index = queue.findIndex(r => r.approval_id === approvalId)
  if (index < 0) return
  writeToWs(wsId, '\r\n→ \x1b[33m审批超时（以服务端为准）\x1b[0m\r\n')
  dequeueApproval(wsId, index)
}

/** 出队一条审批并递减 tab 徽章（用新对象替换以触发响应式） */
function dequeueApproval(wsId: string, index: number): void {
  const queue = approvalQueues.value[wsId] ?? []
  const next = queue.filter((_, i) => i !== index)
  approvalQueues.value = { ...approvalQueues.value, [wsId]: next }
  workspaceStore.decrementPendingApprovals(wsId)
}

// ==================== 终端尺寸变化 ====================
function handleResize(wsId: string, cols: number, rows: number): void {
  const ws = workspaceStore.getById(wsId)
  const rt = runtimeMap.get(wsId)
  if (!rt || !ws?.sessionId || rt.termChannel.state !== 'connected') return
  rt.termChannel.send({
    action: TerminalInputAction.Resize,
    session_id: ws.sessionId,
    cols,
    rows,
  })
}

// ==================== 模式切换 ====================
function handleModeChange(mode: 'shell' | 'agent'): void {
  const id = effectiveActiveId.value
  if (id) {
    workspaceStore.setMode(id, mode)
  }
}

// ==================== 断线重连 ====================
/**
 * 会话终态判定：closed（后端正常结束，如空闲回收）或 failed（WS 断开/错误）。
 * 终态下启用 r 键拦截与重连按钮；connecting/connected 不提供入口避免重复 open。
 */
function isDisconnectedStatus(status: WorkspaceStatus): boolean {
  return status === 'closed' || status === 'failed'
}

/**
 * 重连：重建后端终端会话（对标 MobaXterm 按 r / FinalShell 重连按钮）。
 * WHY 手动触发而不自动重连：终端会话重建后 cwd/运行中程序全部丢失，
 * 自动重连会在用户未察觉时切换会话上下文，审计与心智模型都不安全；
 * 且两参考产品的惯例均为显式触发。
 * 路径：通道仍连接（仅后端会话结束）→ 直接重发 open；
 *       通道已断（WS 层断开）→ connect()，onStateChange connected 后自动补发 open。
 */
function reconnectWorkspace(wsId: string): void {
  const ws = workspaceStore.getById(wsId)
  const rt = runtimeMap.get(wsId)
  if (!ws || !rt) return
  // 终态守卫：仅断线状态可重连，防连接中重复点击发多条 open
  if (!isDisconnectedStatus(ws.status)) return
  workspaceStore.updateStatus(wsId, 'connecting')
  writeToWs(wsId, '\r\n\x1b[36m[正在重连...]\x1b[0m\r\n')
  if (rt.termChannel.state === 'connected') {
    try {
      rt.termChannel.send({ action: TerminalInputAction.Open, host_id: ws.hostId })
    } catch {
      // 状态与实际套接字竞争（send 抛未连接）：退化为重建连接
      rt.termChannel.connect()
    }
  } else {
    rt.termChannel.connect()
  }
}

// ==================== AI 通道处理 ====================
async function sendAiMessage(wsId: string, text: string): Promise<void> {
  const ws = workspaceStore.getById(wsId)
  if (!ws || !text.trim()) return
  // 仅当本 tab 正在流式时拦截——后台 tab 忙不应阻塞本 tab 输入
  if (aiStreamingByWs.value[wsId]) return

  const rt = runtimeMap.get(wsId)
  if (!rt || rt.aiChannel.state !== 'connected') {
    console.warn('[WorkspaceView] AI 通道未连接')
    return
  }

  aiStreamingByWs.value = { ...aiStreamingByWs.value, [wsId]: true }

  // WHY 每个 tab 独立创建会话：审批与 AI 流式响应都按 conversation_id 归属，
  // 多 tab 共享一个会话会让审批/回答在所有 tab 间串台
  let convId = ws.conversationId
  if (!convId) {
    try {
      const conv = await conversationsApi.createConversation({
        conversationCreate: { hostId: ws.hostId },
      })
      convId = conv.id
      workspaceStore.setConversationId(wsId, convId)
    } catch (e) {
      aiStreamingByWs.value = { ...aiStreamingByWs.value, [wsId]: false }
      console.error(`[WorkspaceView] 创建会话失败: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
  }

  // 发送用户消息到 AI 通道
  rt.aiChannel.send({
    type: AiStreamType.UserMessage,
    conversation_id: convId,
    content: text,
    host_id: ws.hostId,
    // WHY 携带 session_id：后端智能体据此把获准命令与只读工具路由回本 tab
    // 连接的持久 PTY（继承 cd/export 状态）；尚未建连时缺省，纯问答回合回落 exec
    session_id: ws.sessionId || undefined,
  })
}

/**
 * Agent 模式 Ctrl+C 打断在飞回合：经本 tab 的 AI 通道发 stop_turn 上行帧，
 * 并立即本地闭环（清生成态 + 写停止注记行）。
 * WHY 本地闭环：run9 实测——后端 interrupt() 可能把收尾帧的 WS 发送一并打断
 * （Tomcat blocking send 同线程，连接 1006），final+停止注记不保证送达；
 * 丢帧不可接受，双份注记可接受——若后端收尾帧送达，流处理对已复位的
 * 生成态是幂等写 false，多出的注记行仅视觉上重复一行。
 */
function stopAgentTurn(wsId: string): void {
  const ws = workspaceStore.getById(wsId)
  const rt = runtimeMap.get(wsId)
  if (!ws?.conversationId || !rt || rt.aiChannel.state !== 'connected') return
  rt.aiChannel.send({
    type: AiStreamType.StopTurn,
    conversation_id: ws.conversationId,
  })
  // 本地立即复位生成态，不等后端收尾帧（文案与后端 STOPPED_NOTE 对齐）
  aiStreamingByWs.value = { ...aiStreamingByWs.value, [wsId]: false }
  writeToWs(wsId, '\r\n（本轮处理已被用户停止。）\r\n')
}

/**
 * AI 流式响应处理——以纯文本按时间顺序写入共享终端：
 * - thinking_delta → 维度文本（ANSI dim）落在「[思考]」前缀行，多个分片同一行累积
 * - answer_delta   → 普通文本落在「[AI]」前缀行
 * - tool_call      → 结束当前段落（审批卡片由 /approval 通道单独驱动，此处不重复创建）
 * - final          → 结束段落，恢复交互；Agent 模式下重新打 [AI] 提示符
 * - error          → 红色错误行 + 结束段落
 * WHY: 回归单一 xterm 后不再有 DOM 消息卡片，thinking/answer 分片直接追写终端，
 *      需自行维护「当前段落」状态在段落切换时补换行；AI 文本含裸 \n 时补 \r
 *      （convertEol 关闭，避免阶梯文本）。
 */

/** 把 AI 文本中的裸换行规范化为 CRLF，避免终端阶梯渲染 */
function normalizeEol(text: string): string {
  return text.replace(/\r?\n/g, '\r\n')
}

/**
 * 按 workspace 隔离的 AI 段落状态：多 tab 并发流式时若共享「当前段落」，
 * 两条输出的 thinking/answer 切换会互相踩坏换行。
 */
const aiSegmentByWs = new Map<string, { thinking: boolean; answer: boolean }>()

function handleAiStream(wsId: string, msg: AiStream): void {
  const ws = workspaceStore.getById(wsId)
  // WHY 按 conversation 归属过滤：/ws/ai 对所有连接广播，多 tab 时每条通道
  // 都会收到全部帧——只处理属于本 tab 会话的帧，防后台 tab 输出写进激活终端
  if (!ws?.conversationId || msg.conversation_id !== ws.conversationId) return

  /** 写入所属 tab 终端实例（后台 tab 写自己隐藏的 buffer，切回 refit 后可见） */
  const write = (s: string): void => {
    writeToWs(wsId, s)
  }
  const setStreaming = (v: boolean): void => {
    aiStreamingByWs.value = { ...aiStreamingByWs.value, [wsId]: v }
  }
  const seg = aiSegmentByWs.get(wsId) ?? { thinking: false, answer: false }
  aiSegmentByWs.set(wsId, seg)
  const closeSeg = (): void => {
    if (seg.thinking || seg.answer) write('\r\n')
    seg.thinking = false
    seg.answer = false
  }

  switch (msg.type) {
    case AiStreamType.ThinkingDelta: {
      const content = msg.content ?? ''
      if (!content) break
      if (!seg.thinking) {
        closeSeg()
        write('\r\n\x1b[2m[思考]\x1b[0m ')
        seg.thinking = true
      }
      write(`\x1b[2m${normalizeEol(content)}\x1b[0m`)
      break
    }

    case AiStreamType.AnswerDelta: {
      const content = msg.content ?? ''
      if (!content) break
      if (!seg.answer) {
        closeSeg()
        write('\r\n\x1b[36m[AI]\x1b[0m ')
        seg.answer = true
      }
      write(normalizeEol(content))
      break
    }

    case AiStreamType.ToolCall:
      // WHY: 审批弹窗统一由 /approval 通道驱动（见 handleApprovalRequest），
      //      AI 通道的 tool_call 仅表示“即将有审批”，此处只结束当前段落避免后续
      //      answer_delta 与审批留痕行交错
      closeSeg()
      break

    case AiStreamType.Final:
      closeSeg()
      setStreaming(false)
      break

    case AiStreamType.Error:
      closeSeg()
      setStreaming(false)
      write(`\r\n\x1b[31m[AI 错误] ${msg.message ?? 'AI 请求处理出错'}\x1b[0m\r\n`)
      break
  }
}

// WHY: 不在此处补打 Agent 输入提示符——TerminalTimeline 采用惰性补打（用户首次键入时
//      才在新行写 ❯），父级若抢先写固定提示符会被后续 PTY/AI 输出拼接错位

// ==================== SFTP 文件操作 ====================
/** 下载远端文件：创建传输任务 → 轮询 ready → 领票 → 触发浏览器下载 */
async function handleFileDownload(entry: FileEntry): Promise<void> {
  const ws = activeWorkspace.value
  if (!ws?.sessionId) return
  try {
    const transfer = await transfersApi.createTransfer({
      id: ws.sessionId,
      xSessionControl: ws.controlToken || '',
      createTransferRequest: {
        direction: 'download' as any,
        remotePath: entry.path,
        fileName: entry.name,
        size: entry.size ?? 0,
      },
    })
    transfers.value = [...transfers.value, transfer]
    pollTransferReady(transfer.id, ws.controlToken || '')
  } catch (e) {
    console.error('[SFTP] 创建下载任务失败:', e)
  }
}

/** 上传文件到远端 */
async function handleFileUpload(files: File[], targetPath: string): Promise<void> {
  const ws = activeWorkspace.value
  if (!ws?.sessionId) return
  for (const file of files) {
    try {
      const transfer = await transfersApi.createTransfer({
        id: ws.sessionId,
        xSessionControl: ws.controlToken || '',
        createTransferRequest: {
          direction: 'upload' as any,
          remotePath: `${targetPath}/${file.name}`,
          fileName: file.name,
          size: file.size,
        },
      })
      transfers.value = [...transfers.value, transfer]
      await transferContentApi.uploadTransferContent({
        id: transfer.id,
        body: file,
      })
    } catch (e) {
      console.error(`[SFTP] 上传 ${file.name} 失败:`, e)
    }
  }
}

/** 轮询传输任务直到 ready 状态，然后触发下载 */
function pollTransferReady(transferId: string, controlToken: string): void {
  const interval = setInterval(async () => {
    try {
      const updated = await transfersApi.getTransfer({ id: transferId })
      updateTransferInList(updated)
      if (updated.status === 'ready') {
        clearInterval(interval)
        const ticket = await transfersApi.claimDownloadTicket({
          id: transferId,
          xSessionControl: controlToken,
        })
        const url = `/api/transfers/${transferId}/content?ticket=${ticket.ticket}`
        const a = document.createElement('a')
        a.href = url
        a.download = updated.fileName
        a.click()
      } else if (['failed', 'cancelled', 'expired'].includes(updated.status)) {
        clearInterval(interval)
      }
    } catch {
      clearInterval(interval)
    }
  }, 1000)
}

/** 更新传输列表中指定任务状态 */
function handleTransferUpdate(updated: Transfer): void {
  updateTransferInList(updated)
}

function updateTransferInList(updated: Transfer): void {
  const idx = transfers.value.findIndex((t) => t.id === updated.id)
  if (idx >= 0) {
    transfers.value[idx] = updated
    transfers.value = [...transfers.value]
  }
}

// ==================== Tab 操作 ====================
function switchTab(id: string): void {
  void router.push(`/workspace/${id}`)
}

/** 以当前激活 tab 的主机多开一个独立连接（多开能力从服务器列表迁入 tab 栏） */
function newTab(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  const created = workspaceStore.createWorkspace({ hostId: ws.hostId, hostName: ws.hostName })
  void router.push(`/workspace/${created.id}`)
}

// WHY: 侧栏 workspace 回跳入口需要知道"最后看在哪个 tab"；immediate 覆盖
// 首次挂载（含路由参数不匹配回退到首个 tab 的情况），切 tab 时同步更新。
// 守卫 routeWorkspaceId 非空：KeepAlive 切页离开路由后参数变空，
// effectiveActiveId 会回退到首个 tab —— 那不是用户正在看的 tab，
// 若无守卫会把 lastActiveId 污染到首个（实测：ws-2 活跃切设置页后回跳落到 ws-1）
watch(effectiveActiveId, (id) => {
  if (id && routeWorkspaceId.value) workspaceStore.setLastActive(id)
}, { immediate: true })

function closeTab(id: string): void {
  disposeWorkspace(id)
  workspaceStore.removeWorkspace(id)

  if (id === effectiveActiveId.value) {
    const remaining = workspaceStore.listAll()
    if (remaining.length > 0) {
      void router.push(`/workspace/${remaining[remaining.length - 1].id}`)
    } else {
      void router.push('/servers')
    }
  }
}

function disposeWorkspace(wsId: string): void {
  const rt = runtimeMap.get(wsId)
  if (!rt) return
  rt.unsubMsg()
  rt.unsubState()
  rt.termChannel.disconnect()
  rt.aiUnsubMsg()
  rt.aiUnsubState()
  rt.aiChannel.disconnect()
  // WHY: 审批通道同样必须退订断开，否则 tab 关闭后残留连接仍会接收 approval_request
  rt.approvalUnsubMsg()
  rt.approvalUnsubState()
  rt.approvalChannel.disconnect()
  runtimeMap.delete(wsId)
  // 终端实例引用兜底清理：组件卸载时函数 ref 会以 null 回调自动删除，
  // 但 disposeWorkspace 先于重渲染执行，显式删除避免残留旧实例写入
  timelineRefs.delete(wsId)
  // 清理该连接待审批队列（残留队列会使徽章/弹窗状态错乱）
  const queues = { ...approvalQueues.value }
  delete queues[wsId]
  approvalQueues.value = queues
  // 清理 per-tab 流式标志与 AI 段落状态，防重建 tab 后状态残留
  const nextStreaming = { ...aiStreamingByWs.value }
  delete nextStreaming[wsId]
  aiStreamingByWs.value = nextStreaming
  aiSegmentByWs.delete(wsId)
}

/**
 * Tab 条键盘导航（roving tabindex 模式）
 */
function handleTabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = workspaces.value
  let newIndex = index

  switch (event.key) {
    case 'ArrowRight':
      newIndex = (index + 1) % tabs.length
      event.preventDefault()
      break
    case 'ArrowLeft':
      newIndex = (index - 1 + tabs.length) % tabs.length
      event.preventDefault()
      break
    case 'Home':
      newIndex = 0
      event.preventDefault()
      break
    case 'End':
      newIndex = tabs.length - 1
      event.preventDefault()
      break
    default:
      return
  }

  switchTab(tabs[newIndex].id)
  const tabElements = document.querySelectorAll('[data-role="tab"]')
  ;(tabElements[newIndex] as HTMLElement)?.focus()
}
</script>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
}

/* ===== Tab 条 ===== */
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  min-height: 36px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  padding: 0 4px;
  gap: 2px;
  overflow-x: auto;
}

/* 多开"+"按钮：与 tab 同高但更窄，悬停提亮提示可点 */
.tab-new {
  flex: 0 0 auto;
  width: 28px;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
}

.tab-new:hover {
  background: #21262d;
  color: #c9d1d9;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  border-radius: 6px 6px 0 0;
}

.tab-item:hover {
  background: #21262d;
  color: #c9d1d9;
}

.tab-item.active {
  background: #0d1117;
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}

.tab-host-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #484f58;
}

.tab-status[data-status='connected'] {
  background: #3fb950;
}

.tab-status[data-status='connecting'] {
  background: #d29922;
}

.tab-status[data-status='failed'] {
  background: #f85149;
}

.tab-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #f0883e;
  color: #ffffff;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.tab-close:hover {
  background: #30363d;
  color: #f85149;
}

/* ===== 主体布局：侧边栏 + 终端 ===== */
.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== SFTP 侧边栏 ===== */
.file-sidebar {
  width: 360px;
  min-width: 300px;
  background: #161b22;
  border-right: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px;
  gap: 12px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #c9d1d9;
}

.sidebar-close-btn {
  background: transparent;
  border: none;
  color: #8b949e;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.sidebar-close-btn:hover {
  color: #f85149;
}

.sidebar-placeholder {
  color: #484f58;
  font-size: 12px;
  padding: 16px 8px;
  text-align: center;
}

/* ===== 内容区域 ===== */
.workspace-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.sidebar-toggle-btn {
  margin-left: auto;
}

.sidebar-toggle-btn + .streaming-indicator {
  margin-left: 12px;
}

.no-workspace {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #484f58;
  font-size: 14px;
}

/* ===== 底部模式切换条 ===== */
.mode-toggle-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  background: #161b22;
  border-top: 1px solid #21262d;
  min-height: 32px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
  background: transparent;
  border: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-btn:hover {
  background: #21262d;
  color: #c9d1d9;
}

.mode-btn.active {
  background: #0d1117;
  color: #58a6ff;
  border-bottom: 2px solid #58a6ff;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 12px;
  color: #8b949e;
}

.streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #58a6ff;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
