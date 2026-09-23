import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由配置
 * WHY: OrcaTerm 风格——终端主视图集成 Shell/Agent 双模式。
 *      V2 新增 /workspace/:workspaceId 路由，支持多 tab 工作区。
 *      旧 /terminal/:hostId 路由保留兼容，但新连接使用 workspace 模式。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/servers',
  },
  {
    path: '/servers',
    name: 'ServerList',
    component: () => import('@/views/ServerListView.vue'),
  },
  {
    path: '/terminal/:hostId',
    name: 'Terminal',
    component: () => import('@/views/TerminalView.vue'),
  },
  {
    // WHY: /chat 复用 TerminalView，无 hostId 时组件自动切入 Agent 模式
    path: '/chat',
    name: 'AiChat',
    component: () => import('@/views/TerminalView.vue'),
  },
  {
    // WHY: V2 多 tab 工作区路由——workspaceId 为本地生成的 workspace 实例 ID
    path: '/workspace/:workspaceId',
    name: 'Workspace',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
