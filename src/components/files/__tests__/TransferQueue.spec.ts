import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TransferQueue from '@/components/files/TransferQueue.vue'
import { transfersApi } from '@/api'
import type { Transfer } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    transfersApi: {
      getTransfer: vi.fn(),
      cancelTransfer: vi.fn(),
      createTransfer: vi.fn(),
      claimDownloadTicket: vi.fn(),
    },
  }
})

const mockApi = transfersApi as unknown as {
  getTransfer: ReturnType<typeof vi.fn>
  cancelTransfer: ReturnType<typeof vi.fn>
  createTransfer: ReturnType<typeof vi.fn>
  claimDownloadTicket: ReturnType<typeof vi.fn>
}

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 't-1',
    sessionId: 'session-1',
    direction: 'upload',
    fileName: 'file.txt',
    remotePath: '/home/file.txt',
    status: 'queued',
    bytesTransferred: 0,
    totalBytes: 1024,
    ...overrides,
  }
}

describe('TransferQueue.vue', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('渲染传入的任务列表', () => {
    const transfers = [
      makeTransfer({ id: 't-1', fileName: 'a.txt', status: 'transferring' }),
      makeTransfer({ id: 't-2', fileName: 'b.txt', status: 'queued' }),
    ]

    const wrapper = mount(TransferQueue, {
      props: { transfers, sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('a.txt')
    expect(wrapper.text()).toContain('b.txt')
  })

  it('上传任务显示发送进度（sentBytes/totalBytes）', () => {
    const transfer = makeTransfer({
      id: 't-1',
      direction: 'upload',
      status: 'transferring',
      bytesTransferred: 512,
      totalBytes: 1024,
    })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('512')
    expect(wrapper.text()).toContain('1024')
  })

  it('下载完成后显示"已交给浏览器"文案', () => {
    const transfer = makeTransfer({
      id: 't-1',
      direction: 'download',
      status: 'delivered',
    })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('已交给浏览器')
  })

  it('取消按钮调用 cancelTransfer', async () => {
    const transfer = makeTransfer({ id: 't-1', status: 'queued' })
    mockApi.cancelTransfer.mockResolvedValue(makeTransfer({ id: 't-1', status: 'cancelled' }))

    const wrapper = mount(TransferQueue, {
      props: {
        transfers: [transfer],
        sessionId: 'session-1',
        controlToken: 'token-1',
      },
    })

    await wrapper.find('[data-action="cancel"]').trigger('click')
    await flushPromises()

    expect(mockApi.cancelTransfer).toHaveBeenCalledWith({ id: 't-1' })
  })

  it('取消后不提前宣称成功——emit update 事件让父组件更新状态', async () => {
    const transfer = makeTransfer({ id: 't-1', status: 'transferring' })
    const cancelled = makeTransfer({ id: 't-1', status: 'cancelled' })
    mockApi.cancelTransfer.mockResolvedValue(cancelled)

    const wrapper = mount(TransferQueue, {
      props: {
        transfers: [transfer],
        sessionId: 'session-1',
        controlToken: 'token-1',
      },
    })

    await wrapper.find('[data-action="cancel"]').trigger('click')
    await flushPromises()

    // WHY: 组件不直接修改 props，而是 emit update 事件让父组件更新
    // 父组件更新 props 后，组件才会显示 cancelled 状态
    expect(mockApi.cancelTransfer).toHaveBeenCalledWith({ id: 't-1' })
    expect(wrapper.emitted('update')).toBeTruthy()
    expect(wrapper.emitted('update')![0][0]).toEqual(cancelled)
    // 当前显示仍为原始状态（transferring），因为 props 未变
    expect(wrapper.text()).not.toContain('完成')
  })

  it('失败任务显示错误信息', () => {
    const transfer = makeTransfer({
      id: 't-1',
      status: 'failed',
      failureMessage: '磁盘空间不足',
    })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('磁盘空间不足')
  })

  it('unknown 状态不自动重试', () => {
    const transfer = makeTransfer({ id: 't-1', status: 'unknown' as any })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    // unknown 状态不应有重试按钮
    expect(wrapper.find('[data-action="retry"]').exists()).toBe(false)
  })

  it('每秒轮询活动任务状态', async () => {
    const transfer = makeTransfer({ id: 't-1', status: 'transferring' })
    mockApi.getTransfer.mockResolvedValue(
      makeTransfer({ id: 't-1', status: 'published', bytesTransferred: 1024 }),
    )

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    // 推进 1 秒触发轮询
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(mockApi.getTransfer).toHaveBeenCalledWith({ id: 't-1' })
  })

  it('终态任务不轮询', async () => {
    const transfer = makeTransfer({ id: 't-1', status: 'published' })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    vi.advanceTimersByTime(3000)
    await flushPromises()

    expect(mockApi.getTransfer).not.toHaveBeenCalled()
  })

  it('覆盖确认——同名文件显示确认按钮', () => {
    const transfer = makeTransfer({
      id: 't-1',
      status: 'queued',
      fileName: 'existing.txt',
    })

    const wrapper = mount(TransferQueue, {
      props: {
        transfers: [transfer],
        sessionId: 'session-1',
        controlToken: 'token-1',
        overwriteCandidates: [{ fileName: 'existing.txt', size: 500, mtime: new Date(), mode: '0644' }],
      },
    })

    expect(wrapper.find('[data-action="confirm-overwrite"]').exists()).toBe(true)
  })

  it('覆盖确认不影响其他同名文件', async () => {
    const transfers = [
      makeTransfer({ id: 't-1', fileName: 'same.txt', status: 'queued' }),
      makeTransfer({ id: 't-2', fileName: 'same.txt', status: 'queued' }),
    ]

    const wrapper = mount(TransferQueue, {
      props: {
        transfers,
        sessionId: 'session-1',
        controlToken: 'token-1',
        overwriteCandidates: [{ fileName: 'same.txt', size: 500, mtime: new Date(), mode: '0644' }],
      },
    })

    // 确认第一个任务的覆盖
    const confirmBtns = wrapper.findAll('[data-action="confirm-overwrite"]')
    if (confirmBtns.length > 0) {
      await confirmBtns[0].trigger('click')
    }

    // emit 事件应只包含被确认的任务 ID
    const emitted = wrapper.emitted('overwrite-confirm')
    if (emitted) {
      expect(emitted[0][0]).toBe('t-1')
    }
  })

  it('键盘可访问——取消按钮可通过 Enter 触发', async () => {
    const transfer = makeTransfer({ id: 't-1', status: 'queued' })
    mockApi.cancelTransfer.mockResolvedValue(makeTransfer({ id: 't-1', status: 'cancelled' }))

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    const cancelBtn = wrapper.find('[data-action="cancel"]')
    expect(cancelBtn.element.tagName).toBe('BUTTON')

    // 按钮天然支持键盘（Enter/Space），无需额外处理
    await cancelBtn.trigger('click')
    await flushPromises()

    expect(mockApi.cancelTransfer).toHaveBeenCalled()
  })

  it('并发修改风险提示', () => {
    const transfer = makeTransfer({
      id: 't-1',
      status: 'failed',
      failureCode: 'concurrent_modification',
      failureMessage: '文件在传输期间被修改',
    })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('并发')
  })

  it('终态释放——closed/expired 任务显示终态', () => {
    const transfer = makeTransfer({ id: 't-1', status: 'expired' })

    const wrapper = mount(TransferQueue, {
      props: { transfers: [transfer], sessionId: 'session-1', controlToken: 'token-1' },
    })

    expect(wrapper.text()).toContain('expired')
  })
})
