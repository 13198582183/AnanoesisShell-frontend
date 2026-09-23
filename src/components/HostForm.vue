<template>
  <form class="host-form" @submit.prevent="handleSubmit" @keydown.enter.prevent="handleSubmit">
    <div class="form-row">
      <label>主机地址 *
        <input data-field="host" v-model.trim="form.host" type="text" placeholder="如 10.0.0.1" />
      </label>
      <span v-if="errors.host" data-error="host" class="error">{{ errors.host }}</span>
    </div>

    <div class="form-row">
      <label>SSH 端口 *
        <input data-field="port" v-model.number="form.port" type="number" min="1" max="65535" />
      </label>
      <span v-if="errors.port" data-error="port" class="error">{{ errors.port }}</span>
    </div>

    <div class="form-row">
      <label>登录用户名 *
        <input data-field="username" v-model.trim="form.username" type="text" placeholder="如 root" />
      </label>
      <span v-if="errors.username" data-error="username" class="error">{{ errors.username }}</span>
    </div>

    <div class="form-row">
      <label>认证方式 *
        <select data-field="authType" v-model="form.authType">
          <option value="password">密码</option>
          <option value="private_key">私钥</option>
        </select>
      </label>
    </div>

    <div class="form-row">
      <label>分组
        <input data-field="groupName" v-model.trim="form.groupName" type="text" placeholder="可选" />
      </label>
    </div>

    <div class="form-row">
      <label>备注
        <input data-field="note" v-model.trim="form.note" type="text" placeholder="可选" />
      </label>
    </div>

    <template v-if="form.authType === 'password'">
      <div class="form-row">
        <label>密码 {{ isCreate ? '*' : '' }}
          <input
            data-field="password"
            v-model="form.password"
            type="password"
            :placeholder="credentialPlaceholder"
            autocomplete="new-password"
          />
        </label>
        <span v-if="credentialMaskHint" class="hint">{{ credentialMaskHint }}</span>
        <span v-if="errors.password" data-error="password" class="error">{{ errors.password }}</span>
      </div>
    </template>

    <template v-else>
      <div class="form-row">
        <label>私钥内容 {{ isCreate ? '*' : '' }}
          <textarea
            data-field="privateKey"
            v-model="form.privateKey"
            rows="4"
            :placeholder="credentialPlaceholder"
          ></textarea>
        </label>
        <span v-if="credentialMaskHint" class="hint">{{ credentialMaskHint }}</span>
        <span v-if="errors.privateKey" data-error="privateKey" class="error">{{ errors.privateKey }}</span>
      </div>
      <div class="form-row">
        <label>私钥口令（passphrase）
          <input
            data-field="passphrase"
            v-model="form.passphrase"
            type="password"
            placeholder="可选"
            autocomplete="new-password"
          />
        </label>
      </div>
    </template>

    <div class="form-actions">
      <button type="button" data-action="cancel" @click="emit('cancel')">取消</button>
      <!--
        WHY: jsdom（vitest 环境）不实现原生表单提交流程——点击 type="submit" 按钮不会自动触发
        form 的 submit 事件，导致组件测试无法通过 click 驱动提交。这里同时保留 form 的
        @submit.prevent（真实浏览器下支持回车提交）与按钮自身的 @click 兜底，两者互不冲突
        （真实浏览器点击 submit 按钮只触发一次 submit 事件，click 处理器额外调用一次会导致
        重复提交，故按钮改为 type="button"，仅依赖显式 click/keydown 触发，避免双重提交）。
      -->
      <button type="button" data-action="submit" @click="handleSubmit">保存</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import type { Host, AuthType } from '@/api'
import type { HostPayload } from '@/stores/hosts'

/**
 * 服务器配置表单（新增/编辑复用）
 *
 * WHY（凭据 writeOnly 处理，契约对齐）：
 * - password/privateKey/passphrase 均为契约标注的 writeOnly 字段，服务端响应从不回显明文，
 *   因此编辑模式下这些输入框必须始终从空白开始，不能回填 props.modelValue 中的任何凭据值
 *   （即便类型定义允许存在，实际运行时也应为 undefined/null）。
 * - 编辑模式下若用户留空凭据字段，提交的 payload 中对应字段应为 undefined（而非空字符串），
 *   契合契约"仅需更换时携带，否则保持不变（不回显、不覆盖为空）"的语义（HostToJSON + JSON.stringify
 *   会自动忽略值为 undefined 的键）。
 * - 通过 credentialSet 掩码布尔值展示"已配置"状态提示，替代明文回显。
 */
const props = defineProps<{ modelValue: Host | null }>()
const emit = defineEmits<{
  (e: 'submit', payload: HostPayload): void
  (e: 'cancel'): void
}>()

interface FormState {
  host: string
  port: number
  username: string
  authType: AuthType
  groupName: string
  note: string
  password: string
  privateKey: string
  passphrase: string
}

function buildInitialForm(): FormState {
  const m = props.modelValue
  return {
    host: m?.host ?? '',
    port: m?.port ?? 22,
    username: m?.username ?? '',
    authType: m?.authType ?? 'password',
    groupName: m?.groupName ?? '',
    note: m?.note ?? '',
    // WHY: 凭据字段永远从空白初始化，绝不回填（writeOnly，服务端本就不会返回明文）
    password: '',
    privateKey: '',
    passphrase: '',
  }
}

const form = reactive<FormState>(buildInitialForm())
const errors = reactive<Record<string, string>>({})

const isCreate = computed(() => props.modelValue === null)

/** 编辑模式且已配置凭据时，输入框 placeholder 提示留空保持不变 */
const credentialPlaceholder = computed(() => {
  if (!isCreate.value && props.modelValue?.credentialSet) {
    return '已配置，留空则保持不变'
  }
  return ''
})

/** 编辑模式下的掩码提示文案（替代明文回显） */
const credentialMaskHint = computed(() => {
  if (!isCreate.value && props.modelValue?.credentialSet) {
    return '该服务器已配置凭据（掩码展示，不回显明文）'
  }
  return ''
})

// WHY: 切换编辑对象（如从"编辑A"切到"编辑B"或切回"新增"）时重置表单，避免脏数据残留
watch(
  () => props.modelValue,
  () => {
    Object.assign(form, buildInitialForm())
    Object.keys(errors).forEach((k) => delete errors[k])
  },
)

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  let valid = true

  if (!form.host) {
    errors.host = '主机地址不能为空'
    valid = false
  }
  if (!form.port || form.port < 1 || form.port > 65535) {
    errors.port = '端口须在 1-65535 之间'
    valid = false
  }
  if (!form.username) {
    errors.username = '用户名不能为空'
    valid = false
  }

  // WHY: 新增模式下凭据为必填（服务端无既有值可复用）；编辑模式下若已配置凭据（credentialSet=true），
  // 留空表示"保持不变"，不强制必填；若编辑模式下 credentialSet=false（如历史数据缺失凭据），仍要求必填。
  const credentialRequired = isCreate.value || !props.modelValue?.credentialSet

  if (form.authType === 'password') {
    if (credentialRequired && !form.password) {
      errors.password = '密码不能为空'
      valid = false
    }
  } else {
    if (credentialRequired && !form.privateKey) {
      errors.privateKey = '私钥内容不能为空'
      valid = false
    }
  }

  return valid
}

function handleSubmit(): void {
  if (!validate()) return

  const payload: HostPayload = {
    host: form.host,
    port: form.port,
    username: form.username,
    authType: form.authType,
    groupName: form.groupName || undefined,
    note: form.note || undefined,
    password: undefined,
    privateKey: undefined,
    passphrase: undefined,
  }

  if (form.authType === 'password') {
    // WHY: 空字符串视为"未填写"，转换为 undefined 以便 JSON.stringify 时被忽略（编辑模式保持不变语义）
    if (form.password) payload.password = form.password
  } else {
    if (form.privateKey) payload.privateKey = form.privateKey
    if (form.passphrase) payload.passphrase = form.passphrase
  }

  emit('submit', payload)
}
</script>

<style scoped>
.host-form {
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
select,
textarea {
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
