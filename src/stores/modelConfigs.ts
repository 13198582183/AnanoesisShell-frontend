import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { modelConfigsApi, describeApiError, type ModelConfig } from '@/api'

/**
 * 新增/编辑模型配置时提交的表单载荷类型（排除只读字段）。
 */
export type ModelConfigPayload = Omit<
  ModelConfig,
  'id' | 'apiKeySet' | 'isActive' | 'createdAt' | 'updatedAt'
>

/**
 * 模型配置 Store（task 7.5）
 * WHY: 封装 modelConfigsApi 的列表/新增/编辑/删除/切换生效调用，并派生出
 * activeConfig 与 needsApiKeyWarning 计算属性。needsApiKeyWarning 对应
 * credential-store spec「未配置 api key 即使用 AI」场景的判定条件，供设置页
 * 展示提示文案，后续 AiChatView（task 9.6，Wave 3）复用同一判定，避免重复实现。
 */
export const useModelConfigsStore = defineStore('modelConfigs', () => {
  const configs = ref<ModelConfig[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeConfig = computed<ModelConfig | null>(
    () => configs.value.find((c) => c.isActive) ?? null,
  )

  /**
   * WHY: 契约规定 api_key 为 writeOnly，前端只能依据 apiKeySet 掩码布尔值判断是否已配置，
   * 不能读取明文。无生效配置或生效配置未设置 api key，均视为"缺 key"。
   */
  const needsApiKeyWarning = computed(
    () => activeConfig.value === null || !activeConfig.value.apiKeySet,
  )

  function resetError() {
    error.value = null
  }

  /**
   * WHY 统一走 describeApiError：生成客户端的 ResponseError 会把后端可读原因
   * 吞成 "Response returned an error code"，设置页的 banner 必须透出真实 message。
   */
  async function recordError(e: unknown): Promise<void> {
    error.value = await describeApiError(e)
  }

  async function fetchConfigs(): Promise<void> {
    loading.value = true
    resetError()
    try {
      configs.value = await modelConfigsApi.listModelConfigs()
    } catch (e) {
      await recordError(e)
      configs.value = []
    } finally {
      loading.value = false
    }
  }

  async function createConfig(payload: ModelConfigPayload): Promise<boolean> {
    resetError()
    try {
      await modelConfigsApi.createModelConfig({ modelConfig: payload })
      await fetchConfigs()
      return true
    } catch (e) {
      await recordError(e)
      return false
    }
  }

  async function updateConfig(id: string, payload: ModelConfigPayload): Promise<boolean> {
    resetError()
    try {
      await modelConfigsApi.updateModelConfig({ id, modelConfig: payload })
      await fetchConfigs()
      return true
    } catch (e) {
      await recordError(e)
      return false
    }
  }

  async function deleteConfig(id: string): Promise<boolean> {
    resetError()
    try {
      await modelConfigsApi.deleteModelConfig({ id })
      await fetchConfigs()
      return true
    } catch (e) {
      await recordError(e)
      return false
    }
  }

  async function setActiveConfig(id: string): Promise<boolean> {
    resetError()
    try {
      await modelConfigsApi.setActiveModelConfig({ activeModelConfigRequest: { id } })
      await fetchConfigs()
      return true
    } catch (e) {
      await recordError(e)
      return false
    }
  }

  return {
    configs,
    loading,
    error,
    activeConfig,
    needsApiKeyWarning,
    fetchConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    setActiveConfig,
  }
})
