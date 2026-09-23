import { defineStore } from 'pinia'
import { ref } from 'vue'
import { hostsApi, type Host } from '@/api'

/**
 * 新增/编辑服务器配置时提交的表单载荷类型。
 * WHY: 与生成客户端的 CreateHostRequest['host'] / UpdateHostRequest['host'] 保持一致，
 * 排除只读字段（id/credentialSet/createdAt/updatedAt），避免调用方误传只读字段。
 */
export type HostPayload = Omit<Host, 'id' | 'credentialSet' | 'createdAt' | 'updatedAt'>

/**
 * 服务器配置 Store（task 5.2）
 * WHY: 封装 hostsApi 的列表/新增/编辑/删除调用与本地状态，供 ServerListView 组件消费，
 * 便于组件测试通过 mock store 隔离网络依赖。
 */
export const useHostsStore = defineStore('hosts', () => {
  const hosts = ref<Host[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function resetError() {
    error.value = null
  }

  async function fetchHosts(): Promise<void> {
    loading.value = true
    resetError()
    try {
      hosts.value = await hostsApi.listHosts()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      hosts.value = []
    } finally {
      loading.value = false
    }
  }

  async function createHost(payload: HostPayload): Promise<boolean> {
    resetError()
    try {
      await hostsApi.createHost({ host: payload })
      await fetchHosts()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  async function updateHost(id: string, payload: HostPayload): Promise<boolean> {
    resetError()
    try {
      await hostsApi.updateHost({ id, host: payload })
      await fetchHosts()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  async function deleteHost(id: string): Promise<boolean> {
    resetError()
    try {
      await hostsApi.deleteHost({ id })
      await fetchHosts()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  return { hosts, loading, error, fetchHosts, createHost, updateHost, deleteHost }
})
