import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadTransferContent, downloadTransferContent, triggerBrowserDownload } from '@/api/transfer-content'
import { transfersApi } from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    transfersApi: {
      claimDownloadTicket: vi.fn(),
    },
  }
})

const mockTransfersApi = transfersApi as unknown as {
  claimDownloadTicket: ReturnType<typeof vi.fn>
}

describe('transfer-content', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('uploadTransferContent', () => {
    it('uses XHR PUT to upload binary content', async () => {
      const xhrMock = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null as any },
        onload: null as any,
        onerror: null as any,
        onabort: null as any,
        status: 200,
      }
      vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))

      const blob = new Blob(['test'], { type: 'application/octet-stream' })
      const promise = uploadTransferContent('transfer-1', blob)

      xhrMock.onload()
      await promise

      expect(xhrMock.open).toHaveBeenCalledWith('PUT', '/api/transfers/transfer-1/content')
      expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream')
      expect(xhrMock.send).toHaveBeenCalledWith(blob)

      vi.unstubAllGlobals()
    })

    it('reports upload progress via callback', async () => {
      const xhrMock = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null as any },
        onload: null as any,
        onerror: null as any,
        onabort: null as any,
        status: 200,
      }
      vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))

      const onProgress = vi.fn()
      const blob = new Blob(['test'])
      const promise = uploadTransferContent('transfer-1', blob, onProgress)

      xhrMock.upload.onprogress({ loaded: 50, total: 100, lengthComputable: true })
      expect(onProgress).toHaveBeenCalledWith({ sentBytes: 50, totalBytes: 100 })

      xhrMock.onload()
      await promise

      vi.unstubAllGlobals()
    })

    it('rejects on non-2xx response', async () => {
      const xhrMock = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null as any },
        onload: null as any,
        onerror: null as any,
        onabort: null as any,
        status: 500,
      }
      vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))

      const blob = new Blob(['test'])
      const promise = uploadTransferContent('transfer-1', blob)

      xhrMock.onload()

      await expect(promise).rejects.toThrow()

      vi.unstubAllGlobals()
    })
  })

  describe('downloadTransferContent', () => {
    it('claims download ticket and constructs download URL', async () => {
      mockTransfersApi.claimDownloadTicket.mockResolvedValueOnce({ ticket: 'tk-abc' })

      const result = await downloadTransferContent('transfer-1', 'session-token')

      expect(mockTransfersApi.claimDownloadTicket).toHaveBeenCalledWith({
        id: 'transfer-1',
        xSessionControl: 'session-token',
      })
      expect(result.ticket).toBe('tk-abc')
      expect(result.url).toContain('/api/transfers/transfer-1/content')
      expect(result.url).toContain('ticket=tk-abc')
    })
  })

  describe('triggerBrowserDownload', () => {
    it('creates anchor element and triggers click', () => {
      const clickFn = vi.fn()
      const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        style: { display: '' },
        click: clickFn,
      } as any)

      triggerBrowserDownload('/api/transfers/t1/content?ticket=tk')

      expect(clickFn).toHaveBeenCalledTimes(1)

      appendChild.mockRestore()
      removeChild.mockRestore()
      vi.restoreAllMocks()
    })
  })

  // ======================================================================
  // 14.7 安全验证：票据与令牌不持久化
  // ======================================================================

  describe('14.7 安全：ticket 不进持久存储', () => {
    it('下载流程后 ticket 不出现在 localStorage 中', async () => {
      const sensitiveTicket = 'tk-secret-7f3a9b2c-do-not-persist'
      mockTransfersApi.claimDownloadTicket.mockResolvedValueOnce({ ticket: sensitiveTicket })

      await downloadTransferContent('transfer-1', 'session-token')

      // WHY 票据是单次有效的安全凭据，不应被持久化到 localStorage。
      // localStorage 在浏览器关闭后仍保留，增加了票据泄露风险。
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        const value = localStorage.getItem(key!)
        expect(value).not.toContain(sensitiveTicket)
      }
    })

    it('下载流程后 ticket 不出现在 sessionStorage 中', async () => {
      const sensitiveTicket = 'tk-secret-session-do-not-persist'
      mockTransfersApi.claimDownloadTicket.mockResolvedValueOnce({ ticket: sensitiveTicket })

      await downloadTransferContent('transfer-1', 'session-token')

      // WHY sessionStorage 虽在标签页关闭后清除，但票据仍不应出现在其中。
      // 票据仅应在内存中短暂存在，用于构造下载 URL 后立即丢弃。
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        const value = sessionStorage.getItem(key!)
        expect(value).not.toContain(sensitiveTicket)
      }
    })
  })
})
