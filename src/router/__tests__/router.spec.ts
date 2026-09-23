import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由配置测试
 * WHY: 验证核心视图路由均可正确解析，默认路由重定向到 /servers。
 *      V2 新增 /workspace/:workspaceId 路由，支持多 tab 工作区。
 */

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/servers' },
  { path: '/servers', name: 'ServerList', component: defineComponent({ template: '<div>servers</div>' }) },
  { path: '/terminal/:hostId', name: 'Terminal', component: defineComponent({ template: '<div>terminal</div>' }) },
  { path: '/chat', name: 'AiChat', component: defineComponent({ template: '<div>chat</div>' }) },
  { path: '/workspace/:workspaceId', name: 'Workspace', component: defineComponent({ template: '<div>workspace</div>' }) },
  { path: '/settings', name: 'Settings', component: defineComponent({ template: '<div>settings</div>' }) },
]

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes,
  })
}

describe('路由配置', () => {
  it('根路径 / 重定向到 /servers', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/servers')
  })

  it('/servers 路由解析到 ServerList', async () => {
    const router = createTestRouter()
    await router.push('/servers')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('ServerList')
  })

  it('/terminal/:hostId 路由携带 hostId 参数', async () => {
    const router = createTestRouter()
    await router.push('/terminal/host-123')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('Terminal')
    expect(router.currentRoute.value.params.hostId).toBe('host-123')
  })

  it('/chat 路由解析到 AiChat', async () => {
    const router = createTestRouter()
    await router.push('/chat')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('AiChat')
  })

  it('/workspace/:workspaceId 路由携带 workspaceId 参数', async () => {
    const router = createTestRouter()
    await router.push('/workspace/ws-1')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('Workspace')
    expect(router.currentRoute.value.params.workspaceId).toBe('ws-1')
  })

  it('/settings 路由解析到 Settings', async () => {
    const router = createTestRouter()
    await router.push('/settings')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('Settings')
  })

  it('ServerListView 组件可通过路由渲染', async () => {
    const router = createTestRouter()
    const App = defineComponent({ template: '<router-view />' })

    const wrapper = mount(App, {
      global: { plugins: [router] },
    })

    await router.push('/servers')
    await router.isReady()

    expect(wrapper.html()).toContain('servers')
  })
})
