import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelConfigForm from '@/components/ModelConfigForm.vue'
import type { ModelConfig } from '@/api'

/**
 * ModelConfigForm 组件测试（task 7.5 + 11.3 + 11.4）
 * WHY: 验证模型配置表单的新增/编辑行为、api_key 的 writeOnly 约束、
 *      供应商下拉选择与切换保护、预算字段验证与回填。
 */
describe('ModelConfigForm.vue', () => {
  function findInput(wrapper: ReturnType<typeof mount>, name: string) {
    return wrapper.find(`[data-field="${name}"]`)
  }

  // ─── 基础行为（保留原有测试） ───

  it('新增模式下渲染空表单，提交必填字段后 emit submit 载荷', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('other')
    await findInput(wrapper, 'provider').setValue('mindie')
    await findInput(wrapper, 'baseUrl').setValue('http://llm.internal/v1')
    await findInput(wrapper, 'model').setValue('qwen-72b')
    await findInput(wrapper, 'apiKey').setValue('sk-secret')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeTruthy()
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('mindie')
    expect(payload.baseUrl).toBe('http://llm.internal/v1')
    expect(payload.model).toBe('qwen-72b')
    expect(payload.apiKey).toBe('sk-secret')
  })

  it('可选择该配置自身的默认思考模式（覆盖全局设置）', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('https://api.openai.com/v1')
    await findInput(wrapper, 'model').setValue('gpt-4o')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')
    await findInput(wrapper, 'defaultThinkingMode').setValue('thinking')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('openai')
    expect(payload.defaultThinkingMode).toBe('thinking')
  })

  it('编辑模式下 apiKey 字段留空提交时为 undefined（不回显、不覆盖）', async () => {
    const existing: ModelConfig = {
      id: 'cfg-1',
      provider: 'mindie',
      baseUrl: 'http://llm.internal/v1',
      model: 'qwen-72b',
      apiKeySet: true,
      isActive: true,
    }
    const wrapper = mount(ModelConfigForm, { props: { modelValue: existing } })

    expect((findInput(wrapper, 'baseUrl').element as HTMLInputElement).value).toBe('http://llm.internal/v1')
    expect((findInput(wrapper, 'apiKey').element as HTMLInputElement).value).toBe('')

    await findInput(wrapper, 'model').setValue('qwen-32b')
    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('mindie')
    expect(payload.model).toBe('qwen-32b')
    expect(payload.apiKey).toBeUndefined()
  })

  it('编辑模式且已配置 api key 时展示"已配置"掩码提示，不回显明文', () => {
    const existing: ModelConfig = {
      id: 'cfg-1',
      provider: 'mindie',
      baseUrl: 'http://llm.internal/v1',
      model: 'qwen-72b',
      apiKeySet: true,
    }
    const wrapper = mount(ModelConfigForm, { props: { modelValue: existing } })

    expect(wrapper.text()).toContain('已配置')
    expect(wrapper.text()).not.toContain('sk-')
  })

  it('必填字段缺失时不 emit submit，展示校验错误', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="provider"]').exists()).toBe(true)
    expect(wrapper.find('[data-error="baseUrl"]').exists()).toBe(true)
    expect(wrapper.find('[data-error="model"]').exists()).toBe(true)
  })

  it('新增模式下 apiKey 为必填', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('http://llm.internal/v1')
    await findInput(wrapper, 'model').setValue('qwen-72b')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="apiKey"]').exists()).toBe(true)
  })

  it('点击取消按钮 emit cancel', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await wrapper.find('[data-action="cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  // ─── 11.3 供应商下拉与切换保护 ───

  it('供应商下拉默认空白（占位），未选择时不可保存', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    // 空白占位不可保存
    await findInput(wrapper, 'baseUrl').setValue('http://example.com')
    await findInput(wrapper, 'model').setValue('test')
    await findInput(wrapper, 'apiKey').setValue('sk-test')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="provider"]').exists()).toBe(true)
  })

  it('选择 openai 时 provider 值为 "openai"', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('https://api.openai.com/v1')
    await findInput(wrapper, 'model').setValue('gpt-4o')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('openai')
  })

  it('选择 ollama 时 provider 值为 "ollama"', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('ollama')
    await findInput(wrapper, 'baseUrl').setValue('http://localhost:11434/v1')
    await findInput(wrapper, 'model').setValue('llama3')
    await findInput(wrapper, 'apiKey').setValue('ollama-key')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('ollama')
  })

  it('选择 other 时需填写自定义供应商名，trim 后非空', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('other')
    await findInput(wrapper, 'provider').setValue('  custom-llm  ')
    await findInput(wrapper, 'baseUrl').setValue('http://custom/v1')
    await findInput(wrapper, 'model').setValue('my-model')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.provider).toBe('custom-llm')
  })

  it('other 模式下自定义名称为空（trim 后）不可保存', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('other')
    await findInput(wrapper, 'provider').setValue('   ')
    await findInput(wrapper, 'baseUrl').setValue('http://custom/v1')
    await findInput(wrapper, 'model').setValue('my-model')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="provider"]').exists()).toBe(true)
  })

  it('切换供应商选项不覆盖已填地址/模型/密钥', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    // 先填写地址/模型/密钥
    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('http://my-proxy/v1')
    await findInput(wrapper, 'model').setValue('my-gpt')
    await findInput(wrapper, 'apiKey').setValue('sk-my-key')

    // 切换到 ollama
    await findInput(wrapper, 'providerSelect').setValue('ollama')

    // WHY: 切换不应覆盖已填内容
    expect((findInput(wrapper, 'baseUrl').element as HTMLInputElement).value).toBe('http://my-proxy/v1')
    expect((findInput(wrapper, 'model').element as HTMLInputElement).value).toBe('my-gpt')
    expect((findInput(wrapper, 'apiKey').element as HTMLInputElement).value).toBe('sk-my-key')
  })

  it('编辑已有配置时供应商下拉正确回填', () => {
    const existing: ModelConfig = {
      id: 'cfg-1',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKeySet: true,
    }
    const wrapper = mount(ModelConfigForm, { props: { modelValue: existing } })

    expect((findInput(wrapper, 'providerSelect').element as HTMLSelectElement).value).toBe('openai')
  })

  it('编辑非预设供应商时，下拉选 other 且自定义输入框回填原名', () => {
    const existing: ModelConfig = {
      id: 'cfg-1',
      provider: 'mindie',
      baseUrl: 'http://llm.internal/v1',
      model: 'qwen-72b',
      apiKeySet: true,
    }
    const wrapper = mount(ModelConfigForm, { props: { modelValue: existing } })

    expect((findInput(wrapper, 'providerSelect').element as HTMLSelectElement).value).toBe('other')
    expect((findInput(wrapper, 'provider').element as HTMLInputElement).value).toBe('mindie')
  })

  // ─── 11.4 预算字段 ───

  it('新建时预算字段有默认值', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('https://api.openai.com/v1')
    await findInput(wrapper, 'model').setValue('gpt-4o')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.contextWindowTokens).toBe(8192)
    expect(payload.maxOutputTokens).toBe(1024)
    expect(payload.outputLimitField).toBe('max_tokens')
    expect(payload.thinkingRequestFormat).toBe('none')
  })

  it('context_window_tokens 范围校验（1024..2097152）', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('https://api.openai.com/v1')
    await findInput(wrapper, 'model').setValue('gpt-4o')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')
    await findInput(wrapper, 'contextWindowTokens').setValue('500')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="contextWindowTokens"]').exists()).toBe(true)
  })

  it('max_output_tokens 必须为正整数', async () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    await findInput(wrapper, 'providerSelect').setValue('openai')
    await findInput(wrapper, 'baseUrl').setValue('https://api.openai.com/v1')
    await findInput(wrapper, 'model').setValue('gpt-4o')
    await findInput(wrapper, 'apiKey').setValue('sk-xxx')
    await findInput(wrapper, 'maxOutputTokens').setValue('-1')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="maxOutputTokens"]').exists()).toBe(true)
  })

  it('编辑已有配置时预算字段正确回填', async () => {
    const existing: ModelConfig = {
      id: 'cfg-1',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKeySet: true,
      contextWindowTokens: 32768,
      maxOutputTokens: 4096,
      outputLimitField: 'max_completion_tokens',
      thinkingRequestFormat: 'qwen_compatible',
    }
    const wrapper = mount(ModelConfigForm, { props: { modelValue: existing } })

    expect((findInput(wrapper, 'contextWindowTokens').element as HTMLInputElement).value).toBe('32768')
    expect((findInput(wrapper, 'maxOutputTokens').element as HTMLInputElement).value).toBe('4096')
    expect((findInput(wrapper, 'outputLimitField').element as HTMLSelectElement).value).toBe('max_completion_tokens')
    expect((findInput(wrapper, 'thinkingRequestFormat').element as HTMLSelectElement).value).toBe('qwen_compatible')

    await wrapper.find('[data-action="submit"]').trigger('click')

    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.contextWindowTokens).toBe(32768)
    expect(payload.maxOutputTokens).toBe(4096)
    expect(payload.outputLimitField).toBe('max_completion_tokens')
    expect(payload.thinkingRequestFormat).toBe('qwen_compatible')
  })

  it('预算说明文字"保守估算"始终可见', () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })
    expect(wrapper.text()).toContain('保守估算')
  })

  it('output_limit_field 和 thinking_request_format 下拉选项正确', () => {
    const wrapper = mount(ModelConfigForm, { props: { modelValue: null } })

    const outputLimitOptions = wrapper.findAll('[data-field="outputLimitField"] option')
    const outputValues = outputLimitOptions.map((o) => (o.element as HTMLOptionElement).value)
    expect(outputValues).toContain('max_tokens')
    expect(outputValues).toContain('max_completion_tokens')

    const thinkingOptions = wrapper.findAll('[data-field="thinkingRequestFormat"] option')
    const thinkingValues = thinkingOptions.map((o) => (o.element as HTMLOptionElement).value)
    expect(thinkingValues).toContain('none')
    expect(thinkingValues).toContain('qwen_compatible')
  })
})
