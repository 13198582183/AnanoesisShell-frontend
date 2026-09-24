<template>
  <div class="settings-view">
    <h1>设置</h1>

    <section class="settings-section">
      <h2>默认思考模式</h2>
      <!--
        WHY（Q3 裁定）：此处读取/更新的是 /api/settings.default_thinking_mode，作为全局默认值；
        各模型配置可在下方表单中选择自身的 defaultThinkingMode 覆盖此全局默认。
      -->
      <label class="inline-field">
        全局默认：
        <select
          data-field="globalThinkingMode"
          :value="settingsStore.defaultThinkingMode ?? ''"
          @change="onGlobalThinkingModeChange"
        >
          <option value="thinking">思考模式</option>
          <option value="non_thinking">非思考模式</option>
        </select>
      </label>
      <p v-if="settingsStore.error" class="error-banner">设置保存失败：{{ settingsStore.error }}</p>
    </section>

    <section class="settings-section">
      <div class="section-header">
        <h2>模型配置</h2>
        <button data-action="create-config" @click="openCreateForm">新增模型配置</button>
      </div>

      <!--
        WHY（credential-store spec「未配置 api key 即使用 AI」场景）：
        契约规定 api_key 为 writeOnly，前端只能依据 apiKeySet 掩码判断是否已配置。
        当无生效配置或生效配置未设置 api key 时展示此提示，供用户（及后续 AiChatView，
        task 9.6/Wave 3）复用同一判定，避免各处重复实现该逻辑。
      -->
      <p v-if="modelConfigsStore.needsApiKeyWarning" class="warning-banner">
        请先在设置中配置模型 api key
      </p>
      <!-- WHY「操作失败」而非「加载失败」：同一 error 也被新增/编辑/删除复用，
           写死「加载失败」会把删除失败误导成列表加载出了问题 -->
      <p v-if="modelConfigsStore.error" class="error-banner">
        模型配置操作失败：{{ modelConfigsStore.error }}
      </p>
      <p v-if="modelConfigsStore.loading" class="loading">加载中...</p>

      <table v-if="!modelConfigsStore.loading" class="config-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Base URL</th>
            <th>模型名</th>
            <th>API Key</th>
            <th>思考模式</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cfg in modelConfigsStore.configs" :key="cfg.id" data-row>
            <td>{{ cfg.provider }}</td>
            <td>{{ cfg.baseUrl }}</td>
            <td>{{ cfg.model }}</td>
            <td>{{ cfg.apiKeySet ? '已配置' : '未配置' }}</td>
            <td>{{ thinkingModeLabel(cfg.defaultThinkingMode) }}</td>
            <td>{{ cfg.isActive ? '当前生效' : '未生效' }}</td>
            <td class="actions">
              <button
                v-if="!cfg.isActive"
                data-action="activate"
                @click="handleActivate(cfg.id!)"
              >
                设为生效
              </button>
              <button data-action="edit-config" @click="openEditForm(cfg)">编辑</button>
              <button data-action="delete-config" @click="handleDelete(cfg.id!)">删除</button>
            </td>
          </tr>
          <tr v-if="modelConfigsStore.configs.length === 0">
            <td colspan="7" class="empty">暂无模型配置，点击"新增模型配置"开始。</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="showForm" class="form-overlay">
      <div class="form-panel">
        <h3>{{ editingConfig ? '编辑模型配置' : '新增模型配置' }}</h3>
        <ModelConfigForm
          :model-value="editingConfig"
          @submit="handleFormSubmit"
          @cancel="closeForm"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useModelConfigsStore, type ModelConfigPayload } from '@/stores/modelConfigs'
import { useSettingsStore } from '@/stores/settings'
import type { ModelConfig, ThinkingMode } from '@/api'
import ModelConfigForm from '@/components/ModelConfigForm.vue'

/**
 * 设置页视图（task 7.5）
 * WHY: 承载模型配置 CRUD + 当前生效切换 + 全局默认思考模式设置；api_key 严格遵循
 * 契约 writeOnly 约束（不回显明文，仅以 apiKeySet 掩码展示状态）。
 */
const modelConfigsStore = useModelConfigsStore()
const settingsStore = useSettingsStore()

const showForm = ref(false)
const editingConfig = ref<ModelConfig | null>(null)

onMounted(() => {
  void settingsStore.fetchSettings()
  void modelConfigsStore.fetchConfigs()
})

function thinkingModeLabel(mode: ThinkingMode | undefined): string {
  if (mode === 'thinking') return '思考'
  if (mode === 'non_thinking') return '非思考'
  return '跟随全局'
}

function onGlobalThinkingModeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as ThinkingMode
  void settingsStore.updateDefaultThinkingMode(value)
}

function openCreateForm(): void {
  editingConfig.value = null
  showForm.value = true
}

function openEditForm(cfg: ModelConfig): void {
  editingConfig.value = cfg
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editingConfig.value = null
}

async function handleFormSubmit(payload: ModelConfigPayload): Promise<void> {
  const ok = editingConfig.value
    ? await modelConfigsStore.updateConfig(editingConfig.value.id!, payload)
    : await modelConfigsStore.createConfig(payload)
  if (ok) {
    closeForm()
  }
}

async function handleActivate(id: string): Promise<void> {
  await modelConfigsStore.setActiveConfig(id)
}

async function handleDelete(id: string): Promise<void> {
  await modelConfigsStore.deleteConfig(id)
}
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.inline-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.warning-banner {
  color: #f9e2af;
  background: rgba(249, 226, 175, 0.1);
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
}
.error-banner {
  color: #f38ba8;
}
.loading,
.empty {
  color: #a6adc8;
}
.config-table {
  width: 100%;
  border-collapse: collapse;
}
.config-table th,
.config-table td {
  border-bottom: 1px solid #313244;
  padding: 0.5rem;
  text-align: left;
  font-size: 0.875rem;
}
.actions {
  display: flex;
  gap: 0.375rem;
}
select,
button {
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}
.form-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.form-panel {
  background: #181825;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #313244;
  min-width: 420px;
}
.form-panel h3 {
  margin-bottom: 1rem;
  font-size: 1rem;
}
</style>
