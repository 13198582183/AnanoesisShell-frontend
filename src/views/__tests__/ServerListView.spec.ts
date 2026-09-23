import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ServerListView from '@/views/ServerListView.vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { hostsApi } from '@/api'
import type { Host } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    hostsApi: {
      listHosts: vi.fn(),
      createHost: vi.fn(),
      updateHost: vi.fn(),
      deleteHost: vi.fn(),
    },
  }
})

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

/**
 * ServerListView 组件测试（task 5.2）
 * WHY: 验证服务器列表页的加载展示、新增/编辑表单联动、删除、"连接终端"跳转行为。
 *      V2 更新：连接按钮改为创建 workspace 并跳转到 /workspace/:workspaceId。
 */
describe('ServerListView.vue', () => {
  const mockHostsApi = hostsApi as unknown as {
    listHosts: ReturnType<typeof vi.fn>
    createHost: ReturnType<typeof vi.fn>
    updateHost: ReturnType<typeof vi.fn>
    deleteHost: ReturnType<typeof vi.fn>
  }

  const sampleHosts: Host[] = [
    {
      id: 'host-1',
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      authType: 'password',
      credentialSet: true,
    },
    {
      id: 'host-2',
      host: '10.0.0.2',
      port: 2222,
      username: 'deploy',
      authType: 'private_key',
      credentialSet: false,
    },
  ]

  function mountView(pinia = createPinia()) {
    return mount(ServerListView, {
      global: { plugins: [pinia] },
    })
  }

  beforeEach(() => {
    // WHY: workspaces store 持久化到 localStorage，上个用例建的 tab 会水合回来
    // 污染"已有/未有 tab"的基数断言
    localStorage.clear()
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mockHostsApi.listHosts.mockResolvedValue(sampleHosts)
  })

  it('挂载时拉取服务器列表并渲染', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mockHostsApi.listHosts).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('10.0.0.1')
    expect(wrapper.text()).toContain('10.0.0.2')
  })

  it('凭据已配置的服务器展示"已配置"掩码，未配置的展示"未配置"，均不回显明文', async () => {
    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-row]')
    expect(rows[0].text()).toContain('已配置')
    expect(rows[1].text()).toContain('未配置')
  })

  it('点击"新增服务器"展示表单，提交后调用 createHost 并关闭表单', async () => {
    mockHostsApi.createHost.mockResolvedValueOnce(sampleHosts[0])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-action="create"]').trigger('click')
    expect(wrapper.findComponent({ name: 'HostForm' }).exists()).toBe(true)

    const form = wrapper.findComponent({ name: 'HostForm' })
    await form.vm.$emit('submit', {
      host: '10.0.0.3',
      port: 22,
      username: 'root',
      authType: 'password',
      password: 'secret',
    })
    await flushPromises()

    expect(mockHostsApi.createHost).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'HostForm' }).exists()).toBe(false)
  })

  it('点击行内"编辑"预填表单（不含凭据明文），提交后调用 updateHost', async () => {
    mockHostsApi.updateHost.mockResolvedValueOnce(sampleHosts[0])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="edit"]')[0].trigger('click')
    const form = wrapper.findComponent({ name: 'HostForm' })
    expect(form.props('modelValue')).toEqual(sampleHosts[0])

    await form.vm.$emit('submit', {
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      authType: 'password',
    })
    await flushPromises()

    expect(mockHostsApi.updateHost).toHaveBeenCalledWith({
      id: 'host-1',
      host: { host: '10.0.0.1', port: 22, username: 'root', authType: 'password' },
    })
  })

  it('点击行内"删除"调用 deleteHost 并刷新列表', async () => {
    mockHostsApi.deleteHost.mockResolvedValueOnce(undefined)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="delete"]')[0].trigger('click')
    await flushPromises()

    expect(mockHostsApi.deleteHost).toHaveBeenCalledWith({ id: 'host-1' })
  })

  it('点击行内"连接终端"创建 workspace 并跳转到 /workspace/:workspaceId', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="connect"]')[0].trigger('click')

    // V2: 创建 workspace 并跳转到工作区视图
    expect(pushMock).toHaveBeenCalledTimes(1)
    const calledUrl = pushMock.mock.calls[0][0] as string
    expect(calledUrl).toMatch(/^\/workspace\/ws-/)
  })

  it('该主机已有 tab 时，点击连接仍新建独立 tab（每次连接都是新实例）', async () => {
    // WHY：用户修订——同一服务器每次连接都必须是独立 tab（独立终端/会话/审批），
    // 不得复用已有 tab；跨页回到工作区的诉求由侧栏“工作区”回跳入口承担
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkspacesStore(pinia)
    const ws1 = store.createWorkspace({ hostId: 'host-1', hostName: '10.0.0.1' })

    const wrapper = mountView(pinia)
    await flushPromises()
    await wrapper.findAll('[data-action="connect"]')[0].trigger('click')

    expect(store.listAll()).toHaveLength(2)
    const created = store.listAll()[1]
    expect(created.id).not.toBe(ws1.id)
    expect(created.hostId).toBe('host-1')
    expect(pushMock).toHaveBeenCalledWith(`/workspace/${created.id}`)
  })

  it('同主机已有多个 tab 时，连接新建的是全新的最后一个 tab', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkspacesStore(pinia)
    store.createWorkspace({ hostId: 'host-1', hostName: '10.0.0.1' })
    store.createWorkspace({ hostId: 'host-1', hostName: '10.0.0.1' })

    const wrapper = mountView(pinia)
    await flushPromises()
    await wrapper.findAll('[data-action="connect"]')[0].trigger('click')

    expect(store.listAll()).toHaveLength(3)
    const latest = store.listAll()[2]
    expect(pushMock).toHaveBeenCalledWith(`/workspace/${latest.id}`)
  })

  it('列表接口失败时展示错误提示', async () => {
    mockHostsApi.listHosts.mockRejectedValueOnce(new Error('server error'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('server error')
  })
})
