import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { KeepAlive, defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { useWorkspacesStore } from '@/stores/workspaces'

/**
 * App 壳侧栏导航测试（导航 bug 修复）
 * WHY: 用户反馈——点连接产生 workspace tab 后切到其他页面就回不去，
 *      只能再点一次连接（还会多出重复 tab）。侧栏必须有 workspace 入口，
 *      且仅在存在 tab 时出现（无 tab 时点了也是空视图，反而困惑）。
 */

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  // 侧栏其余两项是 router-link，stub 成普通标签即可
  RouterLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}))

// `<router-view v-slot="{ Component }">` 需要真组件解析才能拿到 slot props：
// 经 VTU global.components 注册 stub，把命中路由的组件从 slot 传出，
// 否则模板解构 undefined（KeepAlive 断言前提）
const RouterViewStub = defineComponent({
  setup(_props, { slots }) {
    return () =>
      slots.default?.({
        Component: defineComponent({ name: 'StubRouteView', template: '<div data-testid="route-view" />' }),
      })
  },
})

describe('App.vue 侧栏导航', () => {
  beforeEach(() => {
    // WHY: workspaces store 持久化到 localStorage，残留 tab 会污染"无 tab"断言
    localStorage.clear()
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  function mountApp(pinia = createPinia()) {
    return mount(App, { global: { plugins: [pinia], components: { RouterView: RouterViewStub } } })
  }

  it('无任何 workspace tab 时，侧栏不出现 workspace 入口', async () => {
    const wrapper = mountApp()
    await flushPromises()

    expect(wrapper.find('[data-nav="workspace"]').exists()).toBe(false)
  })

  it('存在 tab 时侧栏出现 workspace 入口，点击跳回最后激活的 tab', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })
    const ws2 = store.createWorkspace({ hostId: 'host-2', hostName: 'Server B' })
    store.setLastActive(ws2.id)

    const wrapper = mountApp(pinia)
    await flushPromises()

    const entry = wrapper.find('[data-nav="workspace"]')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')

    expect(pushMock).toHaveBeenCalledWith(`/workspace/${ws2.id}`)
    // 必须是跳转而非新建 tab（重复 tab 是本次 bug 的另一半）
    expect(store.listAll()).toHaveLength(2)
    expect(ws1.id).not.toBe(ws2.id)
  })

  it('有 tab 但从未登记激活记录时，回跳到第一个 tab', async () => {
    const pinia = createPinia()
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: 'Server A' })

    const wrapper = mountApp(pinia)
    await flushPromises()

    await wrapper.find('[data-nav="workspace"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith(`/workspace/${ws1.id}`)
  })

  it('router-view 必须用 KeepAlive 缓存 WorkspaceView：切页不断连接不丢终端历史', async () => {
    // WHY: 浏览器验收发现——离开 workspace 再回跳后终端空白、会话重建
    // （cwd 丢失）：WorkspaceView 卸载时 onBeforeUnmount 销毁全部运行时。
    // spec「后台连接继续工作」要求访问设置页 MUST 保留连接/输出/草稿，
    // KeepAlive include 缓存是唯一经 Vue 官方机制满足它的方案。
    const wrapper = mountApp()
    await flushPromises()

    const keepAlive = wrapper.findComponent(KeepAlive)
    expect(keepAlive.exists()).toBe(true)
    const include = keepAlive.props('include') as string[] | string
    const names = Array.isArray(include) ? include : [include]
    expect(names).toContain('WorkspaceView')
  })
})
