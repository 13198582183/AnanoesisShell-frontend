import {
  Configuration,
  HostsApi,
  ModelConfigsApi,
  SettingsApi,
  SessionsApi,
  SessionsControlApi,
  ApprovalsApi,
  ConversationsApi,
  FilesApi,
  TransfersApi,
  TransferContentApi,
  ResponseError,
} from './generated/src'

// 重新导出所有生成的类型与运行时工具（ResponseError/FetchError 等），
// 方便业务代码统一从 '@/api' 引用，不必感知 generated 目录结构细节。
export * from './generated/src'

/**
 * WHY: openapi-generator 生成的各 Api 类默认使用 DefaultConfig（basePath 取自
 * openapi.yaml 的 servers[0]，即 http://localhost:8080），与前端实际的"同源部署 +
 * Vite dev proxy 转发"模式不符。这里显式构造一个 basePath 为空的 Configuration，
 * 使所有请求走相对路径（如 /api/hosts），由 dev proxy（开发）或反向代理（生产）
 * 负责转发到真实后端，避免前端硬编码后端地址。
 */
const configuration = new Configuration({ basePath: '' })

export const hostsApi = new HostsApi(configuration)
export const modelConfigsApi = new ModelConfigsApi(configuration)
export const settingsApi = new SettingsApi(configuration)
export const sessionsApi = new SessionsApi(configuration)
export const sessionsControlApi = new SessionsControlApi(configuration)
export const approvalsApi = new ApprovalsApi(configuration)
export const conversationsApi = new ConversationsApi(configuration)
export const filesApi = new FilesApi(configuration)
export const transfersApi = new TransfersApi(configuration)
export const transferContentApi = new TransferContentApi(configuration)

/**
 * 把 API 调用异常翻译成给用户看的可读原因。
 *
 * <p>WHY：生成客户端在 HTTP 非 2xx 时抛 {@link ResponseError}，其 message 固定为
 * "Response returned an error code"——后端契约 Error JSON 里的可读 message
 * （如「该模型配置正在生效」）被整个吞掉，用户只能看到技术黑话。这里优先透出
 * 后端原因，body 不是契约 JSON 时退化为状态码说明。</p>
 */
export async function describeApiError(e: unknown): Promise<string> {
  if (e instanceof ResponseError) {
    try {
      // clone：错误对象可能被多处消费，不把 body 流读耗尽
      const body = (await e.response.clone().json()) as { message?: unknown }
      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message
      }
    } catch {
      // body 不是 JSON（网关错误页等），落到状态码描述
    }
    return `服务返回状态 ${e.response.status}`
  }
  return e instanceof Error ? e.message : String(e)
}
