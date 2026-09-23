<template>
  <form class="model-config-form" @submit.prevent="handleSubmit" @keydown.enter.prevent="handleSubmit">
    <!-- WHY: 供应商改为下拉选择（task 11.3），预设 openai/ollama + 自定义 -->
    <div class="form-row">
      <label>供应商 *
        <select data-field="providerSelect" v-model="providerSelect">
          <option value="">请选择</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
          <option value="other">其他</option>
        </select>
      </label>
      <span v-if="errors.provider" data-error="provider" class="error">{{ errors.provider }}</span>
    </div>

    <!-- WHY: 仅 "other" 时显示自定义名称输入框 -->
    <div v-if="providerSelect === 'other'" class="form-row">
      <label>自定义供应商名称 *
        <input data-field="provider" v-model.trim="form.provider" type="text" placeholder="如 mindie/custom-llm" />
      </label>
    </div>

    <div class="form-row">
      <label>Base URL *
        <input data-field="baseUrl" v-model.trim="form.baseUrl" type="text" placeholder="如 http://llm.internal/v1" />
      </label>
      <span v-if="errors.baseUrl" data-error="baseUrl" class="error">{{ errors.baseUrl }}</span>
    </div>

    <div class="form-row">
      <label>模型名 *
        <input data-field="model" v-model.trim="form.model" type="text" placeholder="如 qwen-72b" />
      </label>
      <span v-if="errors.model" data-error="model" class="error">{{ errors.model }}</span>
    </div>

    <div class="form-row">
      <label>API Key {{ isCreate ? '*' : '' }}
        <input
          data-field="apiKey"
          v-model="form.apiKey"
          type="password"
          :placeholder="apiKeyPlaceholder"
          autocomplete="new-password"
        />
      </label>
      <span v-if="apiKeyMaskHint" class="hint">{{ apiKeyMaskHint }}</span>
      <span v-if="errors.apiKey" data-error="apiKey" class="error">{{ errors.apiKey }}</span>
    </div>

    <div class="form-row">
      <label>该配置的默认思考模式（可选，覆盖全局设置）
        <select data-field="defaultThinkingMode" v-model="form.defaultThinkingMode">
          <option value="">跟随全局设置</option>
          <option value="thinking">思考模式</option>
          <option value="non_thinking">非思考模式</option>
        </select>
      </label>
    </div>

    <!-- WHY: 预算字段（task 11.4）—— context_window_tokens / max_output_tokens / output_limit_field / thinking_request_format -->
    <fieldset class="budget-fields">
      <legend>Token 预算</legend>
      <p class="budget-hint">保守估算，需按部署校准</p>

      <div class="form-row">
        <label>上下文窗口 tokens（1024 ~ 2097152）
          <input
            data-field="contextWindowTokens"
            v-model.number="form.contextWindowTokens"
            type="number"
            min="1024"
            max="2097152"
          />
        </label>
        <span v-if="errors.contextWindowTokens" data-error="contextWindowTokens" class="error">{{ errors.contextWindowTokens }}</span>
      </div>

      <div class="form-row">
        <label>最大输出 tokens（正整数）
          <input
            data-field="maxOutputTokens"
            v-model.number="form.maxOutputTokens"
            type="number"
            min="1"
          />
        </label>
        <span v-if="errors.maxOutputTokens" data-error="maxOutputTokens" class="error">{{ errors.maxOutputTokens }}</span>
      </div>

      <div class="form-row">
        <label>输出限制字段名
          <select data-field="outputLimitField" v-model="form.outputLimitField">
            <option value="max_tokens">max_tokens</option>
            <option value="max_completion_tokens">max_completion_tokens</option>
          </select>
        </label>
      </div>

      <div class="form-row">
        <label>思考请求格式
          <select data-field="thinkingRequestFormat" v-model="form.thinkingRequestFormat">
            <option value="none">none</option>
            <option value="qwen_compatible">qwen_compatible</option>
          </select>
        </label>
      </div>
    </fieldset>

    <div class="form-actions">
      <button type="button" data-action="cancel" @click="emit('cancel')">取消</button>
      <!--
        WHY: 与 HostForm 同理，jsdom 不实现原生表单提交流程，按钮改为 type="button"
        并显式绑定 click 事件，避免依赖 form submit 事件在测试环境中不触发的问题。
      -->
      <button type="button" data-action="submit" @click="handleSubmit">保存</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, computed, watch, ref } from 'vue'
import type { ModelConfig, ThinkingMode, OutputLimitField, ThinkingRequestFormat } from '@/api'
import type { ModelConfigPayload } from '@/stores/modelConfigs'

/**
 * 模型配置表单（新增/编辑复用，task 7.5 + 11.3 + 11.4）
 *
 * WHY（api_key writeOnly 处理，契约对齐）：
 * - api_key 为契约标注的 writeOnly 字段，服务端响应从不回显明文，编辑模式下该输入框必须
 *   始终从空白开始，不能回填 props.modelValue 中的任何值。
 * - 编辑模式下若留空，提交 payload 中 apiKey 应为 undefined（而非空字符串），契合契约
 *   "仅需更换时携带，否则保持不变"的语义。
 * - 通过 apiKeySet 掩码布尔值展示"已配置"状态提示，替代明文回显。
 *
 * WHY（供应商下拉，task 11.3）：
 * - 预设 openai/ollama 方便快速选择，"其他"支持自定义名称。
 * - 切换选项不覆盖已填地址/模型/密钥，保护用户输入。
 * - "other" 不当持久协议值——提交时 provider 为自定义文本，不是 "other"。
 *
 * WHY（预算字段，task 11.4）：
 * - context_window_tokens / max_output_tokens 有范围校验。
 * - 旧配置回填、新建用默认值、编辑留空保留。
 */
const props = defineProps<{ modelValue: ModelConfig | null }>()
const emit = defineEmits<{
  (e: 'submit', payload: ModelConfigPayload): void
  (e: 'cancel'): void
}>()

// WHY: 预设供应商列表，非预设值归入 "other"
const PRESET_PROVIDERS = ['openai', 'ollama'] as const

interface FormState {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  defaultThinkingMode: ThinkingMode | ''
  contextWindowTokens: number
  maxOutputTokens: number
  outputLimitField: OutputLimitField
  thinkingRequestFormat: ThinkingRequestFormat
}

/**
 * WHY: providerSelect 是下拉的绑定值，与 form.provider 分离。
 *      预设值直接映射，非预设值映射到 "other" 并在自定义输入框显示原名。
 */
const providerSelect = ref<string>('')

function resolveProviderSelect(provider: string): string {
  if (PRESET_PROVIDERS.includes(provider as typeof PRESET_PROVIDERS[number])) {
    return provider
  }
  if (provider) return 'other'
  return ''
}

function buildInitialForm(): FormState {
  const m = props.modelValue
  return {
    provider: m?.provider ?? '',
    baseUrl: m?.baseUrl ?? '',
    model: m?.model ?? '',
    // WHY: api_key 永远从空白初始化，绝不回填（writeOnly，服务端本就不会返回明文）
    apiKey: '',
    defaultThinkingMode: m?.defaultThinkingMode ?? '',
    // WHY: 预算字段——新建用默认值，编辑回填旧值
    contextWindowTokens: m?.contextWindowTokens ?? 8192,
    maxOutputTokens: m?.maxOutputTokens ?? 1024,
    outputLimitField: m?.outputLimitField ?? 'max_tokens',
    thinkingRequestFormat: m?.thinkingRequestFormat ?? 'none',
  }
}

const form = reactive<FormState>(buildInitialForm())
providerSelect.value = resolveProviderSelect(props.modelValue?.provider ?? '')
const errors = reactive<Record<string, string>>({})

const isCreate = computed(() => props.modelValue === null)

const apiKeyPlaceholder = computed(() => {
  if (!isCreate.value && props.modelValue?.apiKeySet) {
    return '已配置，留空则保持不变'
  }
  return ''
})

const apiKeyMaskHint = computed(() => {
  if (!isCreate.value && props.modelValue?.apiKeySet) {
    return '该配置已配置 api key（掩码展示，不回显明文）'
  }
  return ''
})

watch(
  () => props.modelValue,
  () => {
    Object.assign(form, buildInitialForm())
    providerSelect.value = resolveProviderSelect(props.modelValue?.provider ?? '')
    Object.keys(errors).forEach((k) => delete errors[k])
  },
)

// WHY: 切换供应商下拉时，只有选择预设项才更新 form.provider；
//      选 "other" 时 form.provider 由自定义输入框控制，不覆盖。
watch(providerSelect, (newVal) => {
  if (newVal === 'openai' || newVal === 'ollama') {
    form.provider = newVal
  } else if (newVal === 'other') {
    // WHY: 切换到 other 时，如果 form.provider 是预设值，清空让用户填写
    if (PRESET_PROVIDERS.includes(form.provider as typeof PRESET_PROVIDERS[number])) {
      form.provider = ''
    }
  } else {
    form.provider = ''
  }
})

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  let valid = true

  // WHY: 供应商校验——下拉必须选择，other 时自定义名称 trim 后非空
  if (!providerSelect.value) {
    errors.provider = '请选择供应商'
    valid = false
  } else if (providerSelect.value === 'other' && !form.provider) {
    errors.provider = '自定义供应商名称不能为空'
    valid = false
  }

  if (!form.baseUrl) {
    errors.baseUrl = 'Base URL 不能为空'
    valid = false
  }
  if (!form.model) {
    errors.model = '模型名不能为空'
    valid = false
  }

  // WHY: 新增模式下 api key 为必填；编辑模式下若已配置（apiKeySet=true），
  // 留空表示"保持不变"，不强制必填；若编辑模式下 apiKeySet=false，仍要求必填。
  const apiKeyRequired = isCreate.value || !props.modelValue?.apiKeySet
  if (apiKeyRequired && !form.apiKey) {
    errors.apiKey = 'api key 不能为空'
    valid = false
  }

  // WHY: 预算字段范围校验
  if (form.contextWindowTokens < 1024 || form.contextWindowTokens > 2097152) {
    errors.contextWindowTokens = '上下文窗口 tokens 需在 1024 ~ 2097152 之间'
    valid = false
  }
  if (form.maxOutputTokens < 1 || !Number.isInteger(form.maxOutputTokens)) {
    errors.maxOutputTokens = '最大输出 tokens 需为正整数'
    valid = false
  }

  return valid
}

function handleSubmit(): void {
  if (!validate()) return

  // WHY: 提交时 provider 取 form.provider（自定义文本），不取 providerSelect（可能是 "other"）
  const finalProvider = providerSelect.value === 'other' ? form.provider : form.provider

  const payload: ModelConfigPayload = {
    provider: finalProvider,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey || undefined,
    defaultThinkingMode: form.defaultThinkingMode || undefined,
    contextWindowTokens: form.contextWindowTokens,
    maxOutputTokens: form.maxOutputTokens,
    outputLimitField: form.outputLimitField,
    thinkingRequestFormat: form.thinkingRequestFormat,
  }

  emit('submit', payload)
}
</script>

<style scoped>
.model-config-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 480px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.form-row label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
input,
select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #45475a;
  border-radius: 4px;
  background: #1e1e2e;
  color: #cdd6f4;
}
.error {
  color: #f38ba8;
  font-size: 0.75rem;
}
.hint {
  color: #a6adc8;
  font-size: 0.75rem;
}
.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.budget-fields {
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 0.75rem;
}
.budget-fields legend {
  font-size: 0.875rem;
  color: #a6adc8;
}
.budget-hint {
  font-size: 0.75rem;
  color: #a6adc8;
  margin: 0 0 0.5rem 0;
}
button {
  padding: 0.375rem 0.875rem;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}
button[data-action='submit'] {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}
</style>
