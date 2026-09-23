<template>
  <div class="remote-file-panel" data-file-panel>
    <div class="toolbar">
      <button data-action="parent-dir" :disabled="currentPath === '/'" @click="goParent">⬆ 上级目录</button>
      <button data-action="refresh" @click="refresh">🔄 刷新</button>
      <span class="current-path" data-path>{{ currentPath }}</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error" data-error>{{ error }}</div>

    <table v-if="!loading" class="file-table">
      <!-- WHY 固定列宽：侧边栏窄容器下 auto 布局会被长文件名（如 systemd-private-xxx）
           撑出横向滚动条，大小/时间列被推出视区；
           WHY 无「类型」列：目录已有 hover 指针样式、链接已有 badge，文字列冗余且挤占名称宽度 -->
      <colgroup>
        <col class="col-check" />
        <col class="col-name" />
        <col class="col-size" />
        <col class="col-mtime" />
        <col class="col-action" />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>名称</th>
          <th>大小</th>
          <th>修改时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in entries"
          :key="entry.path"
          :data-entry="entry.name"
          :class="['file-row', { 'is-dir': entry.isDir, 'is-link': entry.isLink }]"
          @dblclick="handleEntryDblClick(entry)"
        >
          <td>
            <input
              v-if="entry.isRegular"
              type="checkbox"
              :data-select="entry.name"
              :checked="selectedPaths.has(entry.path)"
              @change="toggleSelect(entry)"
            />
          </td>
          <td class="entry-name" :title="entry.name">
            {{ entry.name }}
            <span v-if="entry.isLink" class="link-badge">链接</span>
          </td>
          <td>{{ entry.isDir ? '-' : formatSize(entry.size) }}</td>
          <td :title="entry.mtime ? formatTimeFull(entry.mtime) : ''">{{ entry.mtime ? formatTime(entry.mtime) : '-' }}</td>
          <td>
            <button
              v-if="entry.isRegular && !entry.isLink"
              :data-action="'download'"
              class="action-btn"
              @click="emit('download', entry)"
            >
              下载
            </button>
            <span v-else-if="entry.isLink" class="disabled-hint">不可传</span>
          </td>
        </tr>
      </tbody>
    </table>

    <button
      v-if="hasMore"
      data-action="load-more"
      :disabled="loading"
      @click="loadMore"
    >
      {{ loading ? '加载中...' : '加载更多' }}
    </button>

    <!-- 上传区域 -->
    <div class="upload-area">
      <label class="upload-label">
        上传文件到当前目录
        <input type="file" data-action="upload-select" multiple @change="handleFileSelect" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { filesApi } from '@/api'
import type { FileEntry } from '@/api'

/**
 * 远端文件浏览面板（task 14.4）
 *
 * WHY（路径隔离）：
 * - 切 tab 时 sessionId 变化，组件通过 watch props 重新加载对应路径，
 *   各 session 的路径状态互不干扰。
 *
 * WHY（链接/非普通文件不可传）：
 * - SFTP 符号链接或特殊文件（设备文件等）不支持常规传输，
 *   前端标识为"链接"或隐藏下载按钮，防止用户误操作。
 *
 * WHY（所有错误显式呈现）：
 * - 网络错误、权限错误等必须显式展示，不能静默失败。
 */
const props = defineProps<{
  sessionId: string
  controlToken: string
  initialPath: string
}>()

const emit = defineEmits<{
  (e: 'download', entry: FileEntry): void
  (e: 'upload', files: File[], targetPath: string): void
  (e: 'selection-change', paths: string[]): void
}>()

const currentPath = ref(props.initialPath)
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const selectedPaths = ref(new Set<string>())

async function loadDirectory(path: string, cursor?: string) {
  loading.value = true
  error.value = null
  try {
    const resp = await filesApi.listSessionFiles({
      id: props.sessionId,
      xSessionControl: props.controlToken,
      path,
      cursor,
      limit: undefined,
    })
    if (cursor) {
      // WHY: 加载更多时追加，不替换
      entries.value = [...entries.value, ...resp.items]
    } else {
      entries.value = resp.items
    }
    nextCursor.value = resp.nextCursor
    hasMore.value = resp.hasMore
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function goParent() {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  const parent = '/' + parts.join('/')
  currentPath.value = parent || '/'
  loadDirectory(currentPath.value)
}

function refresh() {
  loadDirectory(currentPath.value)
}

function loadMore() {
  if (nextCursor.value) {
    loadDirectory(currentPath.value, nextCursor.value)
  }
}

function handleEntryDblClick(entry: FileEntry) {
  if (entry.isDir) {
    currentPath.value = entry.path
    loadDirectory(entry.path)
  }
}

function toggleSelect(entry: FileEntry) {
  const newSet = new Set(selectedPaths.value)
  if (newSet.has(entry.path)) {
    newSet.delete(entry.path)
  } else {
    newSet.add(entry.path)
  }
  selectedPaths.value = newSet
  emit('selection-change', Array.from(newSet))
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const files = Array.from(input.files)
    emit('upload', files, currentPath.value)
    input.value = ''
  }
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(date: Date | null | undefined): string {
  if (!date) return '-'
  // 紧凑格式 MM-DD HH:mm：侧边栏窄列容不下 toLocaleString 全格式，完整时间放 title
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTimeFull(date: Date | null | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleString()
}

// WHY: 监听 sessionId/initialPath 变化，实现路径隔离
watch(
  () => [props.sessionId, props.initialPath] as const,
  ([newSessionId, newPath]) => {
    currentPath.value = newPath
    selectedPaths.value = new Set()
    loadDirectory(newPath)
  },
)

// 初始加载
loadDirectory(currentPath.value)
</script>

<style scoped>
.remote-file-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.current-path {
  font-family: monospace;
  color: #a6adc8;
}
.file-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.file-table th,
.file-table td {
  padding: 0.25rem 0.35rem;
  border-bottom: 1px solid #45475a;
  text-align: left;
  font-size: 12px;
  overflow: hidden;
}
.col-check {
  width: 24px;
}
.col-size {
  width: 52px;
}
.col-mtime {
  width: 78px;
}
.col-action {
  width: 46px;
}
/* 目录行名称前缀图标：替代被删的「类型」列，保持目录/文件一眼可辨 */
.file-row.is-dir .entry-name::before {
  content: '📁 ';
}
.entry-name {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.file-row.is-dir {
  cursor: pointer;
}
.file-row.is-dir:hover {
  background: #313244;
}
.file-table .action-btn {
  padding: 0.1rem 0.3rem;
  font-size: 11px;
}
.link-badge {
  color: #f9e2af;
  font-size: 0.75rem;
}
.disabled-hint {
  color: #6c7086;
  font-size: 0.75rem;
}
.error {
  color: #f38ba8;
}
.loading {
  color: #a6adc8;
}
.upload-area {
  margin-top: 0.5rem;
}
.upload-label {
  display: inline-block;
  padding: 0.375rem 0.875rem;
  border: 1px solid #45475a;
  border-radius: 4px;
  cursor: pointer;
}
button {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
