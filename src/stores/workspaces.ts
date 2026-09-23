import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

/**
 * 工作区实例类型（task 10.1）
 * WHY: 每个 workspace 代表一次独立连接实例，同主机可多开。
 *      存储连接状态、会话绑定、模式草稿等运行时信息。
 */
export interface Workspace {
  id: string
  hostId: string
  hostName: string
  status: 'connecting' | 'connected' | 'failed' | 'closed'
  mode: 'shell' | 'agent'
  sessionId: string | null
  controlToken: string | null
  conversationId: string | null
  shellDraft: string
  agentDraft: string
  remotePath: string
  pendingApprovals: number
  createdAt: number
}

export type WorkspaceStatus = Workspace['status']
export type WorkspaceMode = Workspace['mode']

let nextId = 1

/**
 * 持久化白名单字段。
 * WHY: 硬刷新（F5）会重载整个 JS 运行时，内存 store 归零 → tab 消失、连接丢失。
 *      但 sessionId / controlToken 属于「连接级」运行时凭据：
 *        - controlToken 出于安全（design D2 / 测试 14.7）绝不可写入任何 Web Storage；
 *        - 二者在页面刷新后后端会话亦已随 WS 断开而失效，无法 bind 复用。
 *      因此仅持久化「tab 身份」（连到哪台主机、当前模式、绑定的 AI 会话、远端路径），
 *      刷新后以 status='connecting' 水合，由 WorkspaceView 重新 open 一条全新会话。
 */
const STORAGE_KEY = 'ananoesis.workspaces'

interface PersistedWorkspace {
  id: string
  hostId: string
  hostName: string
  mode: 'shell' | 'agent'
  conversationId: string | null
  remotePath: string
  createdAt: number
}

/** 从 localStorage 读取 tab 身份并水合为「重连中」的工作区（连接/凭据字段一律重置） */
function loadFromStorage(): Workspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as PersistedWorkspace[]).map((p) => ({
      id: p.id,
      hostId: p.hostId,
      hostName: p.hostName,
      status: 'connecting',
      mode: p.mode === 'agent' ? 'agent' : 'shell',
      sessionId: null,
      controlToken: null,
      conversationId: p.conversationId ?? null,
      shellDraft: '',
      agentDraft: '',
      remotePath: p.remotePath ?? '/',
      pendingApprovals: 0,
      createdAt: p.createdAt ?? Date.now(),
    }))
  } catch {
    // 存储不可用或数据损坏：静默降级为空列表，不阻断启动
    return []
  }
}

/** 仅序列化白名单字段（绝不包含 sessionId / controlToken / 草稿）回写 localStorage */
function persist(list: Workspace[]): void {
  try {
    const data: PersistedWorkspace[] = list.map((w) => ({
      id: w.id,
      hostId: w.hostId,
      hostName: w.hostName,
      mode: w.mode,
      conversationId: w.conversationId,
      remotePath: w.remotePath,
      createdAt: w.createdAt,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // 存储配额/隐私模式异常：忽略，持久化是尽力而为的增强，不影响内存态可用性
  }
}

/**
 * 多连接实例管理 Store（task 10.1）
 * WHY: 支持同主机多开独立 workspace，按 session 不按 host 去重。
 *      每个 workspace 独立管理连接状态、模式草稿、远端路径等。
 */
export const useWorkspacesStore = defineStore('workspaces', () => {
  const hydrated = loadFromStorage()
  const workspaces = ref<Workspace[]>(hydrated)
  // WHY: 恢复自增游标，避免新建 id 与水合回来的历史 id 冲突
  for (const w of hydrated) {
    const m = /^ws-(\d+)$/.exec(w.id)
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1)
  }
  // 任何 tab 身份变化都回写持久层（status/sessionId 等运行时字段不在白名单，无泄露风险）
  watch(workspaces, (list) => persist(list), { deep: true })

  /**
   * 最后激活的 tab id（内存态，故意不持久化）。
   * WHY: 用户离开 workspace 页面后，侧栏入口需要知道"回到哪个 tab"；
   *      刷新后连接已断、旧 tab 会整体重建，持久化反而会把用户引向
   *      一个尚未重连的空白视图，故仅存内存、缺省 null 由消费方回退到首个 tab。
   */
  const lastActiveId = ref<string | null>(null)

  /** 登记最后激活 tab；忽略不存在的 id，防止路由参数滞后把游标指向幽灵 tab */
  function setLastActive(id: string): void {
    if (getById(id)) lastActiveId.value = id
  }

  function createWorkspace(input: { hostId: string; hostName: string }): Workspace {
    const ws: Workspace = {
      id: `ws-${nextId++}`,
      hostId: input.hostId,
      hostName: input.hostName,
      status: 'connecting',
      mode: 'shell',
      sessionId: null,
      controlToken: null,
      conversationId: null,
      shellDraft: '',
      agentDraft: '',
      remotePath: '/',
      pendingApprovals: 0,
      createdAt: Date.now(),
    }
    workspaces.value.push(ws)
    return ws
  }

  function getById(id: string): Workspace | undefined {
    return workspaces.value.find((w) => w.id === id)
  }

  function listAll(): Workspace[] {
    return [...workspaces.value]
  }

  function removeWorkspace(id: string): void {
    const idx = workspaces.value.findIndex((w) => w.id === id)
    if (idx !== -1) workspaces.value.splice(idx, 1)
    // WHY 回退：关掉的正是最后激活 tab 时，游标不能留在已销毁 id 上，
    // 否则侧栏入口会跳向不存在的 tab；回退到剩余最后一个（列表序）或清空
    if (lastActiveId.value === id) {
      const remaining = workspaces.value
      lastActiveId.value = remaining.length > 0 ? remaining[remaining.length - 1].id : null
    }
  }

  function updateStatus(id: string, status: WorkspaceStatus): void {
    const ws = getById(id)
    if (ws) ws.status = status
  }

  /**
   * 设置/清空 tab 的终端会话 ID。
   * @param sessionId 新建会话 id；传 null 表示会话已终结（断线/关闭），
   *                  MUST 清空——残留旧 id 会让输入继续路由到死会话，
   *                  后端逐帧回“终端会话不存在”造成错误风暴（known-issues 实测）
   */
  function setSessionId(id: string, sessionId: string | null): void {
    const ws = getById(id)
    if (ws) ws.sessionId = sessionId
  }

  function setControlToken(id: string, token: string): void {
    const ws = getById(id)
    if (ws) ws.controlToken = token
  }

  function setConversationId(id: string, conversationId: string): void {
    const ws = getById(id)
    if (ws) ws.conversationId = conversationId
  }

  function setMode(id: string, mode: WorkspaceMode): void {
    const ws = getById(id)
    if (ws) ws.mode = mode
  }

  function setShellDraft(id: string, draft: string): void {
    const ws = getById(id)
    if (ws) ws.shellDraft = draft
  }

  function setAgentDraft(id: string, draft: string): void {
    const ws = getById(id)
    if (ws) ws.agentDraft = draft
  }

  function setRemotePath(id: string, path: string): void {
    const ws = getById(id)
    if (ws) ws.remotePath = path
  }

  function incrementPendingApprovals(id: string): void {
    const ws = getById(id)
    if (ws) ws.pendingApprovals++
  }

  function decrementPendingApprovals(id: string): void {
    const ws = getById(id)
    if (ws && ws.pendingApprovals > 0) ws.pendingApprovals--
  }

  return {
    workspaces: computed(() => workspaces.value),
    lastActiveId: computed(() => lastActiveId.value),
    setLastActive,
    createWorkspace,
    getById,
    listAll,
    removeWorkspace,
    updateStatus,
    setSessionId,
    setControlToken,
    setConversationId,
    setMode,
    setShellDraft,
    setAgentDraft,
    setRemotePath,
    incrementPendingApprovals,
    decrementPendingApprovals,
  }
})
