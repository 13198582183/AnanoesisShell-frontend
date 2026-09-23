/**
 * 传输正文模块（task 14.5）
 *
 * WHY: 二进制正文不走生成客户端（XHR/File 直传），避免整个 Blob/base64 经内存中转。
 *      - 上传：PUT /api/transfers/{id}/content，application/octet-stream，XHR 支持进度回调
 *      - 下载：领票 → 附件导航 GET /api/transfers/{id}/content?ticket=
 */

import { transfersApi } from '@/api'
import type { Transfer } from '@/api'

/** 上传进度回调参数 */
export interface UploadProgress {
  /** 已发送字节数（发送端进度） */
  sentBytes: number
  /** 总字节数 */
  totalBytes: number
}

/**
 * 上传文件内容到传输任务
 * WHY: 使用 XHR 而非 fetch，因为需要上传进度回调（xhr.upload.onprogress）。
 *      生成客户端不支持进度回调，且二进制内容不应经 JSON 序列化。
 */
export function uploadTransferContent(
  transferId: string,
  data: Blob,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/transfers/${transferId}/content`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            sentBytes: event.loaded,
            totalBytes: event.total,
          })
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`上传失败: HTTP ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('上传网络错误'))
    xhr.onabort = () => reject(new Error('上传已取消'))

    xhr.send(data)
  })
}

/**
 * 下载文件内容
 * WHY: 先领取下载票据（JSON 控制面用生成客户端），再通过附件导航下载。
 *      浏览器原生下载不支持进度回调，完成文案为"已交给浏览器"。
 */
export async function downloadTransferContent(transferId: string, sessionControl: string): Promise<{ ticket: string; url: string }> {
  const ticketResp = await transfersApi.claimDownloadTicket({
    id: transferId,
    xSessionControl: sessionControl,
  })
  const url = `/api/transfers/${transferId}/content?ticket=${encodeURIComponent(ticketResp.ticket)}`
  return { ticket: ticketResp.ticket, url }
}

/**
 * 触发浏览器原生下载（附件导航）
 * WHY: 通过创建隐藏的 <a> 标签触发下载，不阻塞主线程。
 */
export function triggerBrowserDownload(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
