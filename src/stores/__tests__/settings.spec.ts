import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { settingsApi } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    settingsApi: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
    },
  }
})

/**
 * settings store 测试（task 7.5）
 * WHY: 验证全局默认思考模式的读取与更新（Q3 裁定：设置页读 /api/settings.default_thinking_mode
 * 作为全局默认值，模型配置可各自覆盖）。
 */
describe('useSettingsStore', () => {
  const mockApi = settingsApi as unknown as {
    getSettings: ReturnType<typeof vi.fn>
    updateSettings: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    // WHY: 用 resetAllMocks 而非 clearAllMocks——clearAllMocks 只清空调用记录，
    // 不会清除已排队但未被消费的 mockResolvedValueOnce/mockRejectedValueOnce 实现，
    // 若某个测试多设置了未被调用的 once-mock，会泄漏到后续测试造成假阳性/假阴性。
    vi.resetAllMocks()
  })

  it('fetchSettings() 读取全局默认思考模式', async () => {
    mockApi.getSettings.mockResolvedValueOnce({ defaultThinkingMode: 'thinking' })
    const store = useSettingsStore()

    await store.fetchSettings()

    expect(store.defaultThinkingMode).toBe('thinking')
  })

  it('updateDefaultThinkingMode() 直接采用 updateSettings 响应，无需再次 getSettings', async () => {
    mockApi.updateSettings.mockResolvedValueOnce({ defaultThinkingMode: 'non_thinking' })
    const store = useSettingsStore()

    await store.updateDefaultThinkingMode('non_thinking')

    expect(mockApi.updateSettings).toHaveBeenCalledWith({
      settings: { defaultThinkingMode: 'non_thinking' },
    })
    expect(store.defaultThinkingMode).toBe('non_thinking')
  })

  it('fetchSettings() 失败时记录 error', async () => {
    mockApi.getSettings.mockRejectedValueOnce(new Error('boom'))
    const store = useSettingsStore()

    await store.fetchSettings()

    expect(store.error).toBe('boom')
  })
})
