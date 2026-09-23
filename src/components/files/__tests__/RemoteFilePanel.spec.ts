import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RemoteFilePanel from '@/components/files/RemoteFilePanel.vue'
import { filesApi } from '@/api'
import type { DirectoryListResponse, FileEntry } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    filesApi: {
      listSessionFiles: vi.fn(),
    },
  }
})

const mockApi = filesApi as unknown as {
  listSessionFiles: ReturnType<typeof vi.fn>
}

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name: 'file.txt',
    path: '/home/file.txt',
    size: 1024,
    mode: '0644',
    mtime: new Date('2025-01-01T00:00:00Z'),
    isDir: false,
    isLink: false,
    isRegular: true,
    ...overrides,
  }
}

function makeDirResponse(items: FileEntry[], hasMore = false, nextCursor: string | null = null): DirectoryListResponse {
  return { items, hasMore, nextCursor }
}

describe('RemoteFilePanel.vue', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('挂载时加载根目录内容', async () => {
    const items = [
      makeFileEntry({ name: 'docs', path: '/home/docs', isDir: true }),
      makeFileEntry({ name: 'readme.md', path: '/home/readme.md' }),
    ]
    mockApi.listSessionFiles.mockResolvedValue(makeDirResponse(items))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenCalledWith({
      id: 'session-1',
      xSessionControl: 'token-1',
      path: '/home',
      cursor: undefined,
      limit: undefined,
    })
    expect(wrapper.text()).toContain('docs')
    expect(wrapper.text()).toContain('readme.md')
  })

  it('点击目录项进入子目录', async () => {
    const items = [makeFileEntry({ name: 'sub', path: '/home/sub', isDir: true })]
    const subItems = [makeFileEntry({ name: 'inner.txt', path: '/home/sub/inner.txt' })]
    mockApi.listSessionFiles
      .mockResolvedValueOnce(makeDirResponse(items))
      .mockResolvedValueOnce(makeDirResponse(subItems))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    await wrapper.find('[data-entry="sub"]').trigger('dblclick')
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenLastCalledWith({
      id: 'session-1',
      xSessionControl: 'token-1',
      path: '/home/sub',
      cursor: undefined,
      limit: undefined,
    })
    expect(wrapper.text()).toContain('inner.txt')
  })

  it('点击"返回上级"导航到父目录', async () => {
    const items = [makeFileEntry({ name: 'file.txt', path: '/home/sub/file.txt' })]
    const parentItems = [makeFileEntry({ name: 'sub', path: '/home/sub', isDir: true })]
    mockApi.listSessionFiles
      .mockResolvedValueOnce(makeDirResponse(items))
      .mockResolvedValueOnce(makeDirResponse(parentItems))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home/sub' },
    })
    await flushPromises()

    await wrapper.find('[data-action="parent-dir"]').trigger('click')
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenLastCalledWith({
      id: 'session-1',
      xSessionControl: 'token-1',
      path: '/home',
      cursor: undefined,
      limit: undefined,
    })
  })

  it('点击刷新按钮重新加载当前目录', async () => {
    const items = [makeFileEntry({ name: 'file.txt' })]
    mockApi.listSessionFiles.mockResolvedValue(makeDirResponse(items))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    await wrapper.find('[data-action="refresh"]').trigger('click')
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenCalledTimes(2)
  })

  it('"加载更多"使用 cursor 分页', async () => {
    const page1 = makeDirResponse(
      [makeFileEntry({ name: 'f1.txt' })],
      true,
      'cursor-2',
    )
    const page2 = makeDirResponse(
      [makeFileEntry({ name: 'f2.txt' })],
      false,
      null,
    )
    mockApi.listSessionFiles
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    await wrapper.find('[data-action="load-more"]').trigger('click')
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenLastCalledWith({
      id: 'session-1',
      xSessionControl: 'token-1',
      path: '/home',
      cursor: 'cursor-2',
      limit: undefined,
    })
    expect(wrapper.text()).toContain('f1.txt')
    expect(wrapper.text()).toContain('f2.txt')
  })

  it('多文件选择（checkbox）', async () => {
    const items = [
      makeFileEntry({ name: 'a.txt', path: '/home/a.txt' }),
      makeFileEntry({ name: 'b.txt', path: '/home/b.txt' }),
    ]
    mockApi.listSessionFiles.mockResolvedValue(makeDirResponse(items))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    const checkboxes = wrapper.findAll('[data-select]')
    expect(checkboxes).toHaveLength(2)

    await checkboxes[0].trigger('change')
    await checkboxes[1].trigger('change')

    expect(wrapper.emitted('selection-change')).toBeTruthy()
  })

  it('链接/非普通文件标识不可传', async () => {
    const items = [
      makeFileEntry({ name: 'link.txt', isLink: true, isRegular: false }),
      makeFileEntry({ name: 'normal.txt', isLink: false, isRegular: true }),
    ]
    mockApi.listSessionFiles.mockResolvedValue(makeDirResponse(items))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    // 链接文件不应有下载按钮
    const linkEntry = wrapper.find('[data-entry="link.txt"]')
    expect(linkEntry.text()).toContain('链接')

    // 普通文件应有下载按钮
    const normalEntry = wrapper.find('[data-entry="normal.txt"]')
    expect(normalEntry.find('[data-action="download"]').exists()).toBe(true)
  })

  it('API 错误显式呈现', async () => {
    mockApi.listSessionFiles.mockRejectedValue(new Error('权限不足'))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('权限不足')
    expect(wrapper.find('[data-error]').exists()).toBe(true)
  })

  it('切 tab 路径隔离——不同 sessionId 独立维护路径', async () => {
    const items1 = [makeFileEntry({ name: 'file1.txt' })]
    const items2 = [makeFileEntry({ name: 'file2.txt' })]
    mockApi.listSessionFiles
      .mockResolvedValueOnce(makeDirResponse(items1))
      .mockResolvedValueOnce(makeDirResponse(items2))

    const wrapper = mount(RemoteFilePanel, {
      props: { sessionId: 'session-1', controlToken: 'token-1', initialPath: '/home/a' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('file1.txt')

    // 切换到另一个 session
    await wrapper.setProps({ sessionId: 'session-2', controlToken: 'token-2', initialPath: '/home/b' })
    await flushPromises()

    expect(mockApi.listSessionFiles).toHaveBeenLastCalledWith({
      id: 'session-2',
      xSessionControl: 'token-2',
      path: '/home/b',
      cursor: undefined,
      limit: undefined,
    })
    expect(wrapper.text()).toContain('file2.txt')
  })
})
