import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useModelConfigsStore } from '@/stores/modelConfigs'
import { modelConfigsApi } from '@/api'
import type { ModelConfig } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    modelConfigsApi: {
      listModelConfigs: vi.fn(),
      createModelConfig: vi.fn(),
      updateModelConfig: vi.fn(),
      deleteModelConfig: vi.fn(),
      setActiveModelConfig: vi.fn(),
    },
  }
})

/**
 * modelConfigs store 测试（task 7.5）
 * WHY: 验证模型配置 CRUD、当前生效切换，以及"未配置 api key"判定逻辑
 *      （供设置页展示提示，后续 AiChatView 复用同一判定）。
 */
describe('useModelConfigsStore', () => {
  const mockApi = modelConfigsApi as unknown as {
    listModelConfigs: ReturnType<typeof vi.fn>
    createModelConfig: ReturnType<typeof vi.fn>
    updateModelConfig: ReturnType<typeof vi.fn>
    deleteModelConfig: ReturnType<typeof vi.fn>
    setActiveModelConfig: ReturnType<typeof vi.fn>
  }

  const activeWithKey: ModelConfig = {
    id: 'cfg-1',
    provider: 'mindie',
    baseUrl: 'http://llm.internal/v1',
    model: 'qwen-72b',
    apiKeySet: true,
    defaultThinkingMode: 'thinking',
    isActive: true,
  }

  const activeWithoutKey: ModelConfig = {
    id: 'cfg-2',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKeySet: false,
    isActive: true,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('fetchConfigs() 拉取列表并计算 activeConfig', async () => {
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithKey])
    const store = useModelConfigsStore()

    await store.fetchConfigs()

    expect(store.configs).toEqual([activeWithKey])
    expect(store.activeConfig).toEqual(activeWithKey)
  })

  it('activeConfig 已配置 api key 时 needsApiKeyWarning 为 false', async () => {
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithKey])
    const store = useModelConfigsStore()

    await store.fetchConfigs()

    expect(store.needsApiKeyWarning).toBe(false)
  })

  it('activeConfig 未配置 api key 时 needsApiKeyWarning 为 true', async () => {
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithoutKey])
    const store = useModelConfigsStore()

    await store.fetchConfigs()

    expect(store.needsApiKeyWarning).toBe(true)
  })

  it('无任何生效配置时 needsApiKeyWarning 为 true', async () => {
    mockApi.listModelConfigs.mockResolvedValueOnce([])
    const store = useModelConfigsStore()

    await store.fetchConfigs()

    expect(store.activeConfig).toBeNull()
    expect(store.needsApiKeyWarning).toBe(true)
  })

  it('createConfig() 提交载荷并刷新列表', async () => {
    mockApi.createModelConfig.mockResolvedValueOnce(activeWithKey)
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithKey])
    const store = useModelConfigsStore()

    const payload = { provider: 'mindie', baseUrl: 'http://llm.internal/v1', model: 'qwen-72b', apiKey: 'sk-xxx' }
    const ok = await store.createConfig(payload)

    expect(ok).toBe(true)
    expect(mockApi.createModelConfig).toHaveBeenCalledWith({ modelConfig: payload })
    expect(mockApi.listModelConfigs).toHaveBeenCalledTimes(1)
  })

  it('updateConfig() 提交 id + 载荷并刷新列表', async () => {
    mockApi.updateModelConfig.mockResolvedValueOnce(activeWithKey)
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithKey])
    const store = useModelConfigsStore()

    const payload = { provider: 'mindie', baseUrl: 'http://llm.internal/v1', model: 'qwen-72b' }
    await store.updateConfig('cfg-1', payload)

    expect(mockApi.updateModelConfig).toHaveBeenCalledWith({ id: 'cfg-1', modelConfig: payload })
  })

  it('deleteConfig() 调用删除接口并刷新列表', async () => {
    mockApi.deleteModelConfig.mockResolvedValueOnce(undefined)
    mockApi.listModelConfigs.mockResolvedValueOnce([])
    const store = useModelConfigsStore()

    await store.deleteConfig('cfg-1')

    expect(mockApi.deleteModelConfig).toHaveBeenCalledWith({ id: 'cfg-1' })
  })

  it('setActiveConfig() 切换当前生效配置并刷新列表', async () => {
    mockApi.setActiveModelConfig.mockResolvedValueOnce(activeWithKey)
    mockApi.listModelConfigs.mockResolvedValueOnce([activeWithKey])
    const store = useModelConfigsStore()

    await store.setActiveConfig('cfg-1')

    expect(mockApi.setActiveModelConfig).toHaveBeenCalledWith({ activeModelConfigRequest: { id: 'cfg-1' } })
  })
})
