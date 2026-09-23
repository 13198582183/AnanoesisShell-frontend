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
