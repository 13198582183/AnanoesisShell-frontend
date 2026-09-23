import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHostsStore } from '@/stores/hosts'
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

/**
 * hosts store 测试
 * WHY: task 5.2 要求服务器列表 + 配置表单（新增/编辑/删除）消费生成的 REST 客户端，
 *      store 层封装 API 调用与列表状态，便于组件测试与复用。
 */
describe('useHostsStore', () => {
  const mockHostsApi = hostsApi as unknown as {
    listHosts: ReturnType<typeof vi.fn>
    createHost: ReturnType<typeof vi.fn>
    updateHost: ReturnType<typeof vi.fn>
    deleteHost: ReturnType<typeof vi.fn>
  }

  const sampleHost: Host = {
    id: 'host-1',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    authType: 'password',
    credentialSet: true,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('fetchHosts() 调用 listHosts 并填充 hosts 状态', async () => {
    mockHostsApi.listHosts.mockResolvedValueOnce([sampleHost])
    const store = useHostsStore()

    await store.fetchHosts()

    expect(mockHostsApi.listHosts).toHaveBeenCalledTimes(1)
    expect(store.hosts).toEqual([sampleHost])
    expect(store.loading).toBe(false)
  })

  it('fetchHosts() 失败时记录 error，不抛出异常', async () => {
    mockHostsApi.listHosts.mockRejectedValueOnce(new Error('network down'))
    const store = useHostsStore()

    await store.fetchHosts()

    expect(store.error).toBe('network down')
    expect(store.hosts).toEqual([])
  })

  it('createHost() 提交表单载荷并在成功后刷新列表', async () => {
    mockHostsApi.createHost.mockResolvedValueOnce(sampleHost)
    mockHostsApi.listHosts.mockResolvedValueOnce([sampleHost])
    const store = useHostsStore()

    const payload = { host: '10.0.0.1', port: 22, username: 'root', authType: 'password' as const, password: 'secret' }
    await store.createHost(payload)

    expect(mockHostsApi.createHost).toHaveBeenCalledWith({ host: payload })
    expect(mockHostsApi.listHosts).toHaveBeenCalledTimes(1)
    expect(store.hosts).toEqual([sampleHost])
  })

  it('updateHost() 提交 id + 载荷（凭据字段缺省时不覆盖，符合契约"仅需更换时携带"）', async () => {
    mockHostsApi.updateHost.mockResolvedValueOnce(sampleHost)
    mockHostsApi.listHosts.mockResolvedValueOnce([sampleHost])
    const store = useHostsStore()

    const payload = { host: '10.0.0.2', port: 22, username: 'root', authType: 'password' as const }
    await store.updateHost('host-1', payload)

    expect(mockHostsApi.updateHost).toHaveBeenCalledWith({ id: 'host-1', host: payload })
  })

  it('deleteHost() 调用删除接口并刷新列表', async () => {
    mockHostsApi.deleteHost.mockResolvedValueOnce(undefined)
    mockHostsApi.listHosts.mockResolvedValueOnce([])
    const store = useHostsStore()

    await store.deleteHost('host-1')

    expect(mockHostsApi.deleteHost).toHaveBeenCalledWith({ id: 'host-1' })
    expect(store.hosts).toEqual([])
  })

  it('createHost() 失败时记录 error 且不刷新列表', async () => {
    mockHostsApi.createHost.mockRejectedValueOnce(new Error('validation failed'))
    const store = useHostsStore()

    await store.createHost({ host: '10.0.0.1', port: 22, username: 'root', authType: 'password' })

    expect(store.error).toBe('validation failed')
    expect(mockHostsApi.listHosts).not.toHaveBeenCalled()
  })
})
