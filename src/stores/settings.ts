import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi, type ThinkingMode } from '@/api'

/**
 * 全局设置 Store（task 7.5）
 * WHY: Q3 裁定——设置页读取 /api/settings.default_thinking_mode 作为全局默认思考模式，
 * 模型配置（modelConfigs store）可各自携带 defaultThinkingMode 覆盖此全局值。
 * 二者是"全局默认 + 单配置覆盖"的分层关系，此处仅负责全局默认值本身。
 */
export const useSettingsStore = defineStore('settings', () => {
  const defaultThinkingMode = ref<ThinkingMode | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function resetError() {
    error.value = null
  }

  async function fetchSettings(): Promise<void> {
    loading.value = true
    resetError()
    try {
      const settings = await settingsApi.getSettings()
      defaultThinkingMode.value = settings.defaultThinkingMode
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function updateDefaultThinkingMode(mode: ThinkingMode): Promise<boolean> {
    resetError()
    try {
      const settings = await settingsApi.updateSettings({ settings: { defaultThinkingMode: mode } })
      defaultThinkingMode.value = settings.defaultThinkingMode
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  return { defaultThinkingMode, loading, error, fetchSettings, updateDefaultThinkingMode }
})
