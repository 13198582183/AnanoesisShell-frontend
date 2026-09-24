import { describe, it, expect } from 'vitest'
import { ResponseError, describeApiError } from '@/api'

/**
 * describeApiError 测试
 * WHY: openapi-generator 生成的客户端在 HTTP 非 2xx 时抛 ResponseError，其
 * message 固定为 "Response returned an error code"，把后端契约 Error JSON 里的
 * 可读原因（message 字段）整个吞掉——用户在界面上只看到一句技术黑话。
 * 设置页的模型配置错误展示需要透出后端原因，故抽出统一的错误描述函数。
 */
describe('describeApiError', () => {
  it('ResponseError 携带 Error JSON 时透出后端 message', async () => {
    const response = new Response(JSON.stringify({ code: 'conflict', message: '该模型配置正在生效' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })
    const error = new ResponseError(response, 'Response returned an error code')

    expect(await describeApiError(error)).toBe('该模型配置正在生效')
  })

  it('ResponseError 的 body 不是 JSON 时退化为状态码说明', async () => {
    const response = new Response('<html>bad gateway</html>', { status: 502 })
    const error = new ResponseError(response, 'Response returned an error code')

    expect(await describeApiError(error)).toContain('502')
  })

  it('ResponseError 的 body 是 JSON 但没有 message 时同样退化', async () => {
    const response = new Response(JSON.stringify({ foo: 'bar' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
    const error = new ResponseError(response, 'Response returned an error code')

    expect(await describeApiError(error)).toContain('400')
  })

  it('普通 Error 取其 message', async () => {
    expect(await describeApiError(new Error('network down'))).toBe('network down')
  })

  it('非 Error 值字符串化兜底', async () => {
    expect(await describeApiError('boom')).toBe('boom')
  })
})
