import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { hostsApi, modelConfigsApi, settingsApi } from '@/api'

/**
 * API 客户端装配测试
 * WHY: openapi-generator 生成的客户端默认 basePath 取自 openapi.yaml 的 servers[0]
 *      （http://localhost:8080），与前端实际部署方式（同源 + Vite dev proxy 转发到后端）不符。
 *      src/api/index.ts 需显式把 basePath 置空，使请求走相对路径（如 /api/hosts），
 *      由 dev proxy（开发）或反向代理（生产）负责转发到真实后端，避免前端硬编码后端地址。
 */

/** 构造一个最小可用的 Response 桩对象（仅覆盖 runtime.ts 实际用到的字段/方法） */
function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response
}

describe('REST API 客户端装配', () => {
  let fetchMock: Mock

  beforeEach(() => {
    fetchMock = vi.fn(async () => mockJsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hostsApi.listHosts() 请求相对路径 /api/hosts（不带后端主机名）', async () => {
    await hostsApi.listHosts()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/hosts')
  })

  it('modelConfigsApi.listModelConfigs() 请求相对路径 /api/model-configs', async () => {
    await modelConfigsApi.listModelConfigs()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/model-configs')
  })

  it('settingsApi.getSettings() 请求相对路径 /api/settings', async () => {
    await settingsApi.getSettings()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/settings')
  })

  it('hostsApi.createHost() 将 camelCase 表单字段序列化为契约要求的 snake_case JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: 'host-1', host: '10.0.0.1', port: 22, username: 'root', auth_type: 'password', credential_set: true }, 201),
    )

    await hostsApi.createHost({
      host: {
        host: '10.0.0.1',
        port: 22,
        username: 'root',
        authType: 'password',
        password: 'secret',
      },
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      auth_type: 'password',
      password: 'secret',
      group_name: undefined,
      note: undefined,
      private_key: undefined,
      passphrase: undefined,
    })
  })

  it('hostsApi.listHosts() 响应中的 snake_case 字段被还原为 camelCase（credential_set -> credentialSet）', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse([
        { id: 'host-1', host: '10.0.0.1', port: 22, username: 'root', auth_type: 'password', credential_set: true },
      ]),
    )

    const hosts = await hostsApi.listHosts()

    expect(hosts).toEqual([
      {
        id: 'host-1',
        host: '10.0.0.1',
        port: 22,
        username: 'root',
        authType: 'password',
        credentialSet: true,
        groupName: undefined,
        note: undefined,
        password: undefined,
        privateKey: undefined,
        passphrase: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ])
  })
})
