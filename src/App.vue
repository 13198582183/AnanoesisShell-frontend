<template>
  <div id="app-shell">
    <!--
      左侧图标导航栏（OrcaTerm 风格）
      WHY: 专业 SSH 客户端均采用窄图标栏而非文本导航，最大化终端工作区面积；
           图标使用 SVG inline 以避免额外字体依赖。
    -->
    <aside class="app-sidebar">
      <div class="sidebar-brand" title="AnanoesisShell">
        <!-- Terminal icon -->
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>

      <nav class="sidebar-nav">
        <!--
          workspace 回跳入口（仅在存在 tab 时出现）
          WHY: 用户反馈——连接后切到服务器/设置页就回不去，只能再点一次连接
               产生重复 tab；用 button+router.push 而非 router-link，因为目标
               路径依赖 store 状态（最后激活 tab），需在点击时动态解析。
        -->
        <button
          v-if="workspaceStore.workspaces.length > 0"
          class="sidebar-link"
          data-nav="workspace"
          title="工作区"
          @click="goWorkspace"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>

        <router-link to="/servers" class="sidebar-link" data-nav="servers" title="服务器">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" />
            <circle cx="6" cy="6" r="1" fill="currentColor" />
            <circle cx="6" cy="18" r="1" fill="currentColor" />
          </svg>
        </router-link>

        <router-link to="/settings" class="sidebar-link" data-nav="settings" title="设置">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </router-link>
      </nav>
    </aside>

    <!-- 主工作区 -->
    <div class="app-workspace">
      <main class="app-main">
        <!--
          KeepAlive 缓存 WorkspaceView：切页不断连接、不丢终端历史
          WHY: spec「后台连接继续工作」要求访问设置/服务器页 MUST 保留连接与输出；
               此前切页卸载组件触发 onBeforeUnmount 销毁全部运行时（会话重建、cwd 丢失），
               缓存后组件不卸载，WS 通道与 per-tab 终端缓冲原地存活。
        -->
        <router-view v-slot="{ Component }">
          <KeepAlive :include="['WorkspaceView']">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </main>

      <!--
        底部状态栏（OrcaTerm 风格）
        WHY: 始终展示连接状态与当前上下文，用户无需进入特定页面即可感知全局状态。
      -->
      <footer class="app-statusbar">
        <span class="statusbar-item statusbar-brand">AnanoesisShell</span>
        <span class="statusbar-item statusbar-separator">|</span>
        <span class="statusbar-item" data-region="connection-status">
          <span class="status-dot" :data-connected="isBackendConnected"></span>
          {{ isBackendConnected ? '后端已连接' : '后端离线' }}
        </span>
      </footer>
    </div>

    <!--
      审批统一内嵌到工作区终端流（见 WorkspaceView + TerminalTimeline）。
      WHY: 此前挂在此处的全局悬浮 ApprovalCard 会浮在任意页面之上、遮挡终端已执行命令，
           与“卡片嵌入命令流、原位保留”的验收点冲突，故彻底移除。
    -->
  </div>
</template>

<script setup lang="ts">
/**
 * App 壳：OrcaTerm 风格布局——左侧图标栏 + 主工作区 + 底部状态栏
 *
 * WHY: 专业 SSH 客户端（OrcaTerm / FinalShell / MobaXterm）均采用图标栏而非文本导航，
 *      将水平空间最大化留给终端工作区；底部状态栏提供持续的状态反馈。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspacesStore } from '@/stores/workspaces'

const router = useRouter()
const workspaceStore = useWorkspacesStore()

/**
 * 回跳工作区：优先最后激活 tab，没有则首个 tab。
 * WHY lastActiveId 可能指向已关闭 tab（跨页期间被关闭）：此时回退到列表首个，
 * store 的 removeWorkspace 已有回退逻辑，但路由参差兼容一层更稳。
 */
function goWorkspace(): void {
  const list = workspaceStore.workspaces
  if (list.length === 0) return
  const target = list.find((w) => w.id === workspaceStore.lastActiveId) ?? list[0]
  void router.push(`/workspace/${target.id}`)
}

const isBackendConnected = ref(false)
let healthTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  checkBackendHealth()
  healthTimer = setInterval(checkBackendHealth, 10000)
})

onBeforeUnmount(() => {
  if (healthTimer !== null) {
    clearInterval(healthTimer)
    healthTimer = null
  }
})

async function checkBackendHealth(): Promise<void> {
  try {
    const resp = await fetch('/actuator/health', { signal: AbortSignal.timeout(3000) })
    isBackendConnected.value = resp.ok
  } catch {
    isBackendConnected.value = false
  }
}
</script>

<style>
/* ===== 全局重置 ===== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  overflow: hidden;
}

/* ===== App Shell 布局 ===== */
#app-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* ===== 左侧图标栏 ===== */
.app-sidebar {
  width: 48px;
  min-width: 48px;
  background: #161b22;
  border-right: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.sidebar-brand {
  color: #58a6ff;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid #21262d;
  width: 100%;
  display: flex;
  justify-content: center;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.sidebar-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  color: #8b949e;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

/* workspace 入口是 button（非 router-link）：清除浏览器默认外观，与相邻链接对齐 */
button.sidebar-link {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.sidebar-link:hover {
  background: #21262d;
  color: #c9d1d9;
}

.sidebar-link.router-link-active {
  background: #1f6feb22;
  color: #58a6ff;
}

/* ===== 主工作区 ===== */
.app-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ===== 底部状态栏 ===== */
.app-statusbar {
  height: 24px;
  min-height: 24px;
  background: #161b22;
  border-top: 1px solid #21262d;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  font-size: 11px;
  color: #8b949e;
}

.statusbar-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.statusbar-separator {
  color: #30363d;
}

.statusbar-brand {
  color: #8b949e;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f85149;
}

.status-dot[data-connected='true'] {
  background: #3fb950;
}

/* ===== 审批内嵌流样式已下沉至 TerminalTimeline 组件 ===== */
</style>
