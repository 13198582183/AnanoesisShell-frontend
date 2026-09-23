<template>
  <div class="server-list-view">
    <div class="header">
      <h1>服务器列表</h1>
      <button data-action="create" @click="openCreateForm">新增服务器</button>
    </div>

    <p v-if="store.error" class="error-banner">加载失败：{{ store.error }}</p>
    <p v-if="store.loading" class="loading">加载中...</p>

    <table v-if="!store.loading" class="host-table">
      <thead>
        <tr>
          <th>主机</th>
          <th>端口</th>
          <th>用户名</th>
          <th>认证方式</th>
          <th>分组</th>
          <th>备注</th>
          <th>凭据状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="host in store.hosts" :key="host.id" data-row>
          <td>{{ host.host }}</td>
          <td>{{ host.port }}</td>
          <td>{{ host.username }}</td>
          <td>{{ host.authType === 'password' ? '密码' : '私钥' }}</td>
          <td>{{ host.groupName || '-' }}</td>
          <td>{{ host.note || '-' }}</td>
          <!--
            WHY: 契约规定 password/private_key/passphrase 为 writeOnly，服务端响应从不回显明文，
            仅以 credential_set 掩码布尔值表示"是否已配置"，此处据此展示"已配置/未配置"文案，
            绝不尝试展示任何明文凭据内容。
          -->
          <td>{{ host.credentialSet ? '已配置' : '未配置' }}</td>
          <td class="actions">
            <button data-action="connect" @click="connectWorkspace(host.id!, host.host)">连接终端</button>
            <button data-action="edit" @click="openEditForm(host)">编辑</button>
            <button data-action="delete" @click="handleDelete(host.id!)">删除</button>
          </td>
        </tr>
        <tr v-if="store.hosts.length === 0">
          <td colspan="8" class="empty">暂无服务器配置，点击"新增服务器"开始。</td>
        </tr>
      </tbody>
    </table>

    <div v-if="showForm" class="form-overlay">
      <div class="form-panel">
        <h2>{{ editingHost ? '编辑服务器' : '新增服务器' }}</h2>
        <HostForm
          :model-value="editingHost"
          @submit="handleFormSubmit"
          @cancel="closeForm"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHostsStore, type HostPayload } from '@/stores/hosts'
import { useWorkspacesStore } from '@/stores/workspaces'
import type { Host } from '@/api'
import HostForm from '@/components/HostForm.vue'

/**
 * 服务器列表视图（task 5.2）
 * WHY: 承载服务器配置的列表展示与新增/编辑/删除表单联动，凭据字段严格遵循契约 writeOnly
 * 约束（不回显明文，仅以 credentialSet 掩码展示状态）。
 * V2 更新：连接按钮改为创建 workspace 并跳转到 /workspace/:workspaceId。
 */
const store = useHostsStore()
const workspaceStore = useWorkspacesStore()
const router = useRouter()

const showForm = ref(false)
const editingHost = ref<Host | null>(null)

onMounted(() => {
  void store.fetchHosts()
})

function openCreateForm(): void {
  editingHost.value = null
  showForm.value = true
}

function openEditForm(host: Host): void {
  editingHost.value = host
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editingHost.value = null
}

async function handleFormSubmit(payload: HostPayload): Promise<void> {
  const ok = editingHost.value
    ? await store.updateHost(editingHost.value.id!, payload)
    : await store.createHost(payload)
  if (ok) {
    closeForm()
  }
}

async function handleDelete(id: string): Promise<void> {
  await store.deleteHost(id)
}

/**
 * WHY: V2 多 tab 工作区——点击连接按钮进入工作区视图。
 *      每次连接必新建（用户修订）：同一服务器的每个连接都必须是独立 tab，
 *      各自拥有独立的终端会话/Agent 上下文/人工审批，互不影响；
 *      此前“复用已有 tab”的语义使多次排障被迫共享同一会话，已撤销。
 *      跨页回到工作区的诉求由侧栏“工作区”回跳入口（lastActiveId）承担。
 */
function connectWorkspace(hostId: string, hostName: string): void {
  const ws = workspaceStore.createWorkspace({ hostId, hostName })
  void router.push(`/workspace/${ws.id}`)
}
</script>

<style scoped>
.server-list-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.error-banner {
  color: #f38ba8;
}
.loading,
.empty {
  color: #a6adc8;
}
.host-table {
  width: 100%;
  border-collapse: collapse;
}
.host-table th,
.host-table td {
  border-bottom: 1px solid #313244;
  padding: 0.5rem;
  text-align: left;
  font-size: 0.875rem;
}
.actions {
  display: flex;
  gap: 0.375rem;
}
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
.form-panel h2 {
  margin-bottom: 1rem;
  font-size: 1rem;
}
</style>
