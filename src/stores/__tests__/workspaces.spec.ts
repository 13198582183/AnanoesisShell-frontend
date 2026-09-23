import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspacesStore } from '@/stores/workspaces'

/**
 * Workspace Store 测试（task 10.1）
 * WHY: 验证多连接实例的独立管理——每个 workspace 代表一次独立连接，
 *      同主机可多开（按 session 不按 host 去重），模式切换保留各自草稿，
 *      临时失败可重试，关闭后清理资源。
 */
describe('useWorkspacesStore', () => {
  beforeEach(() => {
    // WHY: store 新增 localStorage 持久化（tab 硬刷新恢复），jsdom 存储跨用例残留
    //      会污染水合结果，每个用例前必须清空
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('创建 workspace 后返回带本地 ID 的实例，初始状态为 connecting', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    expect(ws.id).toBeTruthy()
    expect(ws.hostId).toBe('host-1')
    expect(ws.hostName).toBe('Server A')
    expect(ws.status).toBe('connecting')
    expect(ws.mode).toBe('shell')
    expect(ws.sessionId).toBeNull()
    expect(ws.controlToken).toBeNull()
  })

  it('三个独立实例互不干扰——修改一个的状态不影响其他', () => {
    const store = useWorkspacesStore()
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws3 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    store.updateStatus(ws1.id, 'connected')
    store.updateStatus(ws2.id, 'failed')
    store.setSessionId(ws1.id, 'session-abc')

    const list = store.listAll()
    expect(list).toHaveLength(3)
    expect(list.find(w => w.id === ws1.id)?.status).toBe('connected')
    expect(list.find(w => w.id === ws2.id)?.status).toBe('failed')
    expect(list.find(w => w.id === ws3.id)?.status).toBe('connecting')
    expect(list.find(w => w.id === ws1.id)?.sessionId).toBe('session-abc')
    expect(list.find(w => w.id === ws2.id)?.sessionId).toBeNull()
  })

  it('同主机可多开独立 workspace（按 session 不按 host 去重）', () => {
    const store = useWorkspacesStore()
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    expect(ws1.id).not.toBe(ws2.id)
    expect(store.listAll()).toHaveLength(2)
  })

  it('模式切换保留各自草稿', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    store.setShellDraft(ws.id, 'ls -la')
    store.setAgentDraft(ws.id, '分析日志')
    store.setMode(ws.id, 'agent')

    const retrieved = store.getById(ws.id)
    expect(retrieved?.mode).toBe('agent')
    expect(retrieved?.shellDraft).toBe('ls -la')
    expect(retrieved?.agentDraft).toBe('分析日志')

    // 切回 shell 模式，草稿仍在
    store.setMode(ws.id, 'shell')
    const back = store.getById(ws.id)
    expect(back?.mode).toBe('shell')
    expect(back?.shellDraft).toBe('ls -la')
    expect(back?.agentDraft).toBe('分析日志')
  })

  it('getById 返回 undefined 对于不存在的 ID', () => {
    const store = useWorkspacesStore()
    expect(store.getById('nonexistent')).toBeUndefined()
  })

  it('removeWorkspace 移除实例', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    expect(store.listAll()).toHaveLength(1)

    store.removeWorkspace(ws.id)
    expect(store.listAll()).toHaveLength(0)
    expect(store.getById(ws.id)).toBeUndefined()
  })

  it('lastActiveId 跟随 setLastActive；移除激活 tab 时回退到剩余最后一条', () => {
    // WHY：侧栏“工作区”入口靠 lastActiveId 把用户带回离开前正在用的 tab，
    // 而不是随机第一个；关闭激活 tab 后必须回退，否则入口指向已不存在的会话
    const store = useWorkspacesStore()
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })

    expect(store.lastActiveId).toBeNull()
    store.setLastActive(ws2.id)
    expect(store.lastActiveId).toBe(ws2.id)

    store.removeWorkspace(ws2.id)
    expect(store.lastActiveId).toBe(ws1.id)

    store.removeWorkspace(ws1.id)
    expect(store.lastActiveId).toBeNull()
  })

  it('setLastActive 忽略不存在的 tab id，不把入口指向幽灵会话', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    store.setLastActive(ws.id)

    store.setLastActive('ghost')
    expect(store.lastActiveId).toBe(ws.id)
  })

  it('setControlToken 更新控制令牌', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    store.setControlToken(ws.id, 'token-xyz')
    expect(store.getById(ws.id)?.controlToken).toBe('token-xyz')
  })

  it('setConversationId 更新对话 ID', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    store.setConversationId(ws.id, 'conv-123')
    expect(store.getById(ws.id)?.conversationId).toBe('conv-123')
  })

  it('setRemotePath 更新远端目录', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    expect(store.getById(ws.id)?.remotePath).toBe('/')
    store.setRemotePath(ws.id, '/home/deploy')
    expect(store.getById(ws.id)?.remotePath).toBe('/home/deploy')
  })

  it('incrementPendingApprovals / decrementPendingApprovals 管理待审批计数', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    expect(store.getById(ws.id)?.pendingApprovals).toBe(0)
    store.incrementPendingApprovals(ws.id)
    store.incrementPendingApprovals(ws.id)
    expect(store.getById(ws.id)?.pendingApprovals).toBe(2)
    store.decrementPendingApprovals(ws.id)
    expect(store.getById(ws.id)?.pendingApprovals).toBe(1)
    // 不低于 0
    store.decrementPendingApprovals(ws.id)
    store.decrementPendingApprovals(ws.id)
    expect(store.getById(ws.id)?.pendingApprovals).toBe(0)
  })

  it('listAll 返回按创建顺序的数组', () => {
    const store = useWorkspacesStore()
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'B' })
    const ws3 = store.createWorkspace({ hostId: 'host-3', hostName: 'C' })

    const list = store.listAll()
    expect(list[0].id).toBe(ws1.id)
    expect(list[1].id).toBe(ws2.id)
    expect(list[2].id).toBe(ws3.id)
  })

  // ======================================================================
  // 14.7 安全验证：control_token 不持久化
  // ======================================================================

  it('14.7：control_token 不写入 localStorage', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const sensitiveToken = 'ct-secret-token-9f3a2b1c'

    store.setControlToken(ws.id, sensitiveToken)

    // WHY control_token 是连接级授权凭据（design D2），仅一次展示后
    // 服务端只存散列。前端必须将其保持在内存中（Pinia ref），
    // 绝不写入 localStorage（跨会话持久）或 sessionStorage（跨标签页）。
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const value = localStorage.getItem(key!)
      expect(value).not.toContain(sensitiveToken)
    }
  })

  it('14.7：control_token 不写入 sessionStorage', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const sensitiveToken = 'ct-secret-session-token'

    store.setControlToken(ws.id, sensitiveToken)

    // WHY sessionStorage 虽在标签页关闭后清除，但 control_token 仍不应出现。
    // 它应仅存在于 JavaScript 内存中（Pinia 的 ref），不进入任何 Web Storage API。
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      const value = sessionStorage.getItem(key!)
      expect(value).not.toContain(sensitiveToken)
    }
  })

  it('14.7：store 使用 $state 序列化时不包含 controlToken 明文', () => {
    const store = useWorkspacesStore()
    const ws = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const sensitiveToken = 'ct-secret-serialization-test'

    store.setControlToken(ws.id, sensitiveToken)

    // WHY $state 是 Pinia store 的可序列化状态快照，可能被持久化插件序列化。
    // 验证即使通过 $state 导出，controlToken 也不以明文形式出现。
    const state = JSON.stringify(store.$state)
    expect(state).not.toContain(sensitiveToken)
  })
})
