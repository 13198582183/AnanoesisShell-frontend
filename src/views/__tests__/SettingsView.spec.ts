import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import { modelConfigsApi, settingsApi } from '@/api'
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
    settingsApi: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
    },
  }
})

/**
 * SettingsView 组件测试（task 7.5）
 * WHY: 验证设置页的模型配置 CRUD、当前生效切换、默认思考模式读写，
 *      以及"未配置 api key 即用 AI"时的提示文案（credential-store spec 场景）。
 */
describe('SettingsView.vue', () => {
  const mockModelConfigsApi = modelConfigsApi as unknown as {
    listModelConfigs: ReturnType<typeof vi.fn>
    createModelConfig: ReturnType<typeof vi.fn>
    updateModelConfig: ReturnType<typeof vi.fn>
    deleteModelConfig: ReturnType<typeof vi.fn>
    setActiveModelConfig: ReturnType<typeof vi.fn>
  }
  const mockSettingsApi = settingsApi as unknown as {
    getSettings: ReturnType<typeof vi.fn>
    updateSettings: ReturnType<typeof vi.fn>
  }

  const activeWithKey: ModelConfig = {
    id: 'cfg-1',
    provider: 'mindie',
    baseUrl: 'http://llm.internal/v1',
    model: 'qwen-72b',
    apiKeySet: true,
    isActive: true,
  }

  const inactiveWithoutKey: ModelConfig = {
    id: 'cfg-2',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKeySet: false,
    isActive: false,
  }

  function mountView() {
    return mount(SettingsView, { global: { plugins: [createPinia()] } })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mockSettingsApi.getSettings.mockResolvedValue({ defaultThinkingMode: 'thinking' })
    mockModelConfigsApi.listModelConfigs.mockResolvedValue([activeWithKey])
  })

  it('挂载时拉取全局设置与模型配置列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mockSettingsApi.getSettings).toHaveBeenCalledTimes(1)
    expect(mockModelConfigsApi.listModelConfigs).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('mindie')
  })

  it('展示全局默认思考模式，切换后调用 updateSettings', async () => {
    mockSettingsApi.updateSettings.mockResolvedValueOnce({ defaultThinkingMode: 'non_thinking' })
    const wrapper = mountView()
    await flushPromises()

    const select = wrapper.find('[data-field="globalThinkingMode"]')
    expect((select.element as HTMLSelectElement).value).toBe('thinking')

    await select.setValue('non_thinking')
    await flushPromises()

    expect(mockSettingsApi.updateSettings).toHaveBeenCalledWith({
      settings: { defaultThinkingMode: 'non_thinking' },
    })
  })

  it('生效配置已设置 api key 时不展示缺 key 提示', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('请先在设置中配置模型 api key')
  })

  it('无生效配置或生效配置未设置 api key 时展示"请先在设置中配置模型 api key"提示', async () => {
    mockModelConfigsApi.listModelConfigs.mockResolvedValueOnce([inactiveWithoutKey])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('请先在设置中配置模型 api key')
  })

  it('点击"设为生效"调用 setActiveModelConfig', async () => {
    mockModelConfigsApi.listModelConfigs.mockResolvedValueOnce([activeWithKey, inactiveWithoutKey])
    mockModelConfigsApi.setActiveModelConfig.mockResolvedValueOnce({ ...inactiveWithoutKey, isActive: true })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="activate"]')[0].trigger('click')
    await flushPromises()

    expect(mockModelConfigsApi.setActiveModelConfig).toHaveBeenCalledWith({
      activeModelConfigRequest: { id: 'cfg-2' },
    })
  })

  it('点击"新增模型配置"展示表单，提交后调用 createModelConfig 并关闭表单', async () => {
    mockModelConfigsApi.createModelConfig.mockResolvedValueOnce(activeWithKey)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-action="create-config"]').trigger('click')
    expect(wrapper.findComponent({ name: 'ModelConfigForm' }).exists()).toBe(true)

    const form = wrapper.findComponent({ name: 'ModelConfigForm' })
    await form.vm.$emit('submit', {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
      apiKey: 'sk-local',
    })
    await flushPromises()

    expect(mockModelConfigsApi.createModelConfig).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'ModelConfigForm' }).exists()).toBe(false)
  })

  it('点击行内"编辑"预填表单（不含 api key 明文），提交后调用 updateModelConfig', async () => {
    mockModelConfigsApi.updateModelConfig.mockResolvedValueOnce(activeWithKey)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="edit-config"]')[0].trigger('click')
    const form = wrapper.findComponent({ name: 'ModelConfigForm' })
    expect(form.props('modelValue')).toEqual(activeWithKey)

    await form.vm.$emit('submit', {
      provider: 'mindie',
      baseUrl: 'http://llm.internal/v1',
      model: 'qwen-32b',
    })
    await flushPromises()

    expect(mockModelConfigsApi.updateModelConfig).toHaveBeenCalledWith({
      id: 'cfg-1',
      modelConfig: { provider: 'mindie', baseUrl: 'http://llm.internal/v1', model: 'qwen-32b' },
    })
  })

  it('点击行内"删除"调用 deleteModelConfig', async () => {
    mockModelConfigsApi.deleteModelConfig.mockResolvedValueOnce(undefined)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('[data-action="delete-config"]')[0].trigger('click')
    await flushPromises()

    expect(mockModelConfigsApi.deleteModelConfig).toHaveBeenCalledWith({ id: 'cfg-1' })
  })
})
