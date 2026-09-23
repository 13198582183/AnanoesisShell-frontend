/**
 * WebSocket 消息类型定义
 *
 * WHY: 严格对齐 contract/asyncapi.yaml（0.2.0-draft V2）三个通道 /terminal、/approval、/ai
 * 的五类消息载荷（terminal_input、terminal_output、approval_request、approval_response、
 * ai_stream）。与 REST 客户端不同，WS 载荷不经过 openapi-generator 的 FromJSON/ToJSON
 * 转换，是直接 JSON.stringify/parse 的原样对象，因此字段名与线格式（snake_case）完全一致，
 * 不做驼峰转换，避免前后端字段名不一致导致的隐性 bug。
 *
 * V2 新增：bind/resize 动作、bound/subscription_snapshot 输出类型、
 * context_notice/attempt_reset AI 事件、审批版本/修改、事件归属字段（session_id/event_seq）。
 */

/** 统一错误码（与 REST 契约 openapi.yaml 的 ErrorCode 注册表同源；V2 新增 6 个） */
export const ErrorCode = {
  ValidationError: 'validation_error',
  NotFound: 'not_found',
  Conflict: 'conflict',
  HostUnreachable: 'host_unreachable',
  AuthFailed: 'auth_failed',
  CredentialProtectionUnavailable: 'credential_protection_unavailable',
  ModelEndpointUnreachable: 'model_endpoint_unreachable',
  ModelEndpointError: 'model_endpoint_error',
  ApiKeyMissing: 'api_key_missing',
  InternalError: 'internal_error',
  // V2 新增错误码
  SessionControlRequired: 'session_control_required',
  SessionControlInvalid: 'session_control_invalid',
  TransferQuotaExceeded: 'transfer_quota_exceeded',
  TransferConflict: 'transfer_conflict',
  TransferTargetChanged: 'transfer_target_changed',
  ContextBudgetExceeded: 'context_budget_exceeded',
} as const
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode]

/** 会话结束原因（ssh-connection「连接会话生命周期」） */
export const EndReason = {
  UserDisconnect: 'user_disconnect',
  Timeout: 'timeout',
  RemoteClose: 'remote_close',
} as const
export type EndReason = typeof EndReason[keyof typeof EndReason]

/** 审批决定（command-approval「执行前人工审批」）：approve=执行，cancel=取消，V2 新增 modify=修改后再审 */
export const ApprovalDecision = {
  Approve: 'approve',
  Cancel: 'cancel',
  Modify: 'modify',
} as const
export type ApprovalDecision = typeof ApprovalDecision[keyof typeof ApprovalDecision]

/** 工具调用结果状态（ai-agent「操作透明性」/ command-approval「输出约束」） */
export const ToolResultStatus = {
  Success: 'success',
  Rejected: 'rejected',
  ExecutionTimeout: 'execution_timeout',
  OutputTruncated: 'output_truncated',
  Error: 'error',
} as const
export type ToolResultStatus = typeof ToolResultStatus[keyof typeof ToolResultStatus]

/** ai_stream 事件类型（V2 新增 context_notice/attempt_reset） */
export const AiStreamType = {
  UserMessage: 'user_message',
  ThinkingDelta: 'thinking_delta',
  AnswerDelta: 'answer_delta',
  ToolCall: 'tool_call',
  ToolResult: 'tool_result',
  Final: 'final',
  Error: 'error',
  // V2 新增
  ContextNotice: 'context_notice',
  AttemptReset: 'attempt_reset',
  // 上行：用户 Ctrl+C 打断在飞回合（ai-agent「受控停止任务」）；
  // 放末尾与后端 AiStreamFrame.Type 枚举 ordinal 纪律对齐
  StopTurn: 'stop_turn',
} as const
export type AiStreamType = typeof AiStreamType[keyof typeof AiStreamType]

/** 运维工具名（ai-agent「运维工具集」）：只读工具自动执行，副作用工具须审批 */
export const ToolName = {
  ListDir: 'list_dir',
  ReadFile: 'read_file',
  SystemInfo: 'system_info',
  RunCommand: 'run_command',
} as const
export type ToolName = typeof ToolName[keyof typeof ToolName]

// ---------------------------- 终端 ----------------------------

/** 终端输入动作（V2 新增 bind/resize） */
export const TerminalInputAction = {
  Open: 'open',
  Input: 'input',
  Close: 'close',
  // V2 新增
  Bind: 'bind',
  Resize: 'resize',
} as const
export type TerminalInputAction = typeof TerminalInputAction[keyof typeof TerminalInputAction]

/** 终端输入载荷（客户端 -> 服务器），对齐 asyncapi.yaml TerminalInput */
export interface TerminalInput {
  action: TerminalInputAction
  /** 目标服务器 ID（action=open 时必填） */
  host_id?: string
  /** 会话 ID（action=input/close/bind 时必填；open 成功后由服务器下发） */
  session_id?: string
  /** 终端输入原文（action=input；可含控制字节，如 Ctrl-C=\u0003） */
  data?: string
  /** 连接控制令牌（action=bind 时必填；design D2） */
  control_token?: string
  /** 终端列数（action=resize 时必填） */
  cols?: number
  /** 终端行数（action=resize 时必填） */
  rows?: number
}

/** 终端输出事件类型（V2 新增 bound/subscription_snapshot） */
export const TerminalOutputType = {
  Data: 'data',
  Error: 'error',
  Closed: 'closed',
  // V2 新增
  Bound: 'bound',
  SubscriptionSnapshot: 'subscription_snapshot',
} as const
export type TerminalOutputType = typeof TerminalOutputType[keyof typeof TerminalOutputType]

/** 数据流类别（type=data 时存在） */
export const TerminalOutputStream = {
  Stdout: 'stdout',
  Stderr: 'stderr',
} as const
export type TerminalOutputStream = typeof TerminalOutputStream[keyof typeof TerminalOutputStream]

/** 重连快照（type=subscription_snapshot；design D2） */
export interface SubscriptionSnapshot {
  /** 当前屏幕缓存内容 */
  screen_buffer?: string
  /** 可用事件尾部 */
  event_tail?: Array<{
    event_seq: number
    type: string
    data?: string
  }>
  /** 是否存在事件缺口（不伪造完整恢复） */
  has_gap?: boolean
}

/** 终端输出载荷（服务器 -> 客户端），对齐 asyncapi.yaml TerminalOutput */
export interface TerminalOutput {
  /** 会话 ID（V2：所有输出事件携带） */
  session_id?: string
  /** V2：事件单调递增序号 */
  event_seq?: number
  type: TerminalOutputType
  stream?: TerminalOutputStream
  /** 流式输出数据（type=data） */
  data?: string
  /** 错误码（type=error；通常为 auth_failed 或 host_unreachable） */
  error_code?: ErrorCode
  /** 面向用户的错误说明（type=error） */
  message?: string
  /** 会话结束原因（type=closed） */
  end_reason?: EndReason
  /** 重连快照（type=subscription_snapshot） */
  snapshot?: SubscriptionSnapshot
}

// ---------------------------- 审批 ----------------------------

/** 审批请求载荷（服务器 -> 客户端），对齐 asyncapi.yaml ApprovalRequest */
export interface ApprovalRequest {
  approval_id: string
  conversation_id: string
  host_id: string
  /** 目标服务器展示名（地址），可选便捷字段 */
  host_label?: string
  tool_name: ToolName
  tool_params: Record<string, unknown>
  /** 待执行命令（便捷展示字段，等价于 tool_params.command） */
  command?: string
  /** 智能体分析说明（供用户判断是否批准），MUST NOT 含明文凭据 */
  ai_analysis: string
  /** 审批等待时限（秒）；超时后端自动按取消处理 */
  timeout_seconds?: number | null
  created_at?: string
  // V2 新增字段
  /** 所属连接实例 ID */
  session_id?: string
  /** 事件序号 */
  event_seq?: number
  /** 审批版本快照（V2；修改产生新版本，旧版本不可执行；design D5） */
  version: number
}

/** 审批响应载荷（客户端 -> 服务器），对齐 asyncapi.yaml ApprovalResponse */
export interface ApprovalResponse {
  approval_id: string
  decision: ApprovalDecision
  /** 用户备注（可选） */
  comment?: string | null
  // V2 新增字段
  /** 修改后的命令（decision=modify 时必填；design D5） */
  modified_command?: string
  /** 确认基于的审批版本（防止按钮自行替换命令参数后沿用旧批准；design D5） */
  expected_version?: number
}

// ---------------------------- AI 流式 ----------------------------

/** 工具调用事件明细，对齐 asyncapi.yaml ToolCallEvent */
export interface ToolCallEvent {
  tool_name?: ToolName
  tool_params?: Record<string, unknown>
  /** 是否自动执行（true=只读工具无需审批；false=副作用工具须审批） */
  auto?: boolean
  /** 关联审批 ID（副作用工具经审批时存在） */
  approval_id?: string | null
  /** 工具调用结果状态（tool_result 阶段） */
  result_status?: ToolResultStatus
  /** 工具执行结果文本（rejected/超时时可为空或说明，如"用户已拒绝"） */
  result?: string | null
  // V2 新增归属字段
  /** 工具调用标识（V2；design D2/D5） */
  call_id?: string
  /** 关联命令执行 ID（V2） */
  command_id?: string
  /** 关联 Agent 运行 ID（V2） */
  run_id?: string
}

/** 增量文本归属标识，用于界面区分"思考过程"与"最终回答" */
export const AiStreamSegment = {
  Thinking: 'thinking',
  Answer: 'answer',
} as const
export type AiStreamSegment = typeof AiStreamSegment[keyof typeof AiStreamSegment]

/** 上下文裁剪通知（type=context_notice；agent-context「请求总 token 预算」） */
export interface ContextNotice {
  /** 裁剪前候选条数 */
  candidate_count?: number
  /** 保留条数 */
  retained_count?: number
  /** 估算 token 数 */
  estimated_tokens?: number
}

/** AI 流式消息载荷（双向），对齐 asyncapi.yaml AiStream */
export interface AiStream {
  type: AiStreamType
  conversation_id: string
  /** 关联消息 ID（final 时用于与历史消息对齐） */
  message_id?: string
  /** 目标服务器 ID（user_message 提交时可携带） */
  host_id?: string
  /** 本回合是否思考模式（model-provider「思考与非思考双模式」） */
  thinking_mode?: boolean
  /** 增量文本（thinking_delta/answer_delta）或用户提问文本（user_message） */
  content?: string
  segment?: AiStreamSegment
  /** 工具调用事件（type=tool_call / tool_result） */
  tool_call?: ToolCallEvent
  /** 错误码（type=error） */
  error_code?: ErrorCode
  /** 面向用户的错误/说明文本（type=error） */
  message?: string
  /** 回合结束原因（type=final；如 stop/tool_calls/length） */
  finish_reason?: string | null
  // V2 新增字段
  /** 所属连接实例 ID */
  session_id?: string
  /** 事件序号 */
  event_seq?: number
  /** 上下文裁剪通知（type=context_notice） */
  context_notice?: ContextNotice
  /** 恢复尝试 ID（type=attempt_reset；design D7） */
  attempt_id?: string
  /** 恢复尝试次数（type=attempt_reset；首次恢复为 1） */
  attempt_number?: number
}

// ---------------------------- 运行时类型守卫 ----------------------------

function isObject(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/** 校验是否为合法的 TerminalInput 载荷（V2：含 bind/resize） */
export function isTerminalInput(data: unknown): data is TerminalInput {
  if (!isObject(data)) return false
  return isOneOf(data.action, [
    TerminalInputAction.Open,
    TerminalInputAction.Input,
    TerminalInputAction.Close,
    TerminalInputAction.Bind,
    TerminalInputAction.Resize,
  ])
}

/** 校验是否为合法的 TerminalOutput 载荷（V2：含 bound/subscription_snapshot） */
export function isTerminalOutput(data: unknown): data is TerminalOutput {
  if (!isObject(data)) return false
  return isOneOf(data.type, [
    TerminalOutputType.Data,
    TerminalOutputType.Error,
    TerminalOutputType.Closed,
    TerminalOutputType.Bound,
    TerminalOutputType.SubscriptionSnapshot,
  ])
}

/** 校验是否为合法的 ApprovalRequest 载荷（V2：新增 version 必填字段） */
export function isApprovalRequest(data: unknown): data is ApprovalRequest {
  if (!isObject(data)) return false
  return (
    typeof data.approval_id === 'string' &&
    typeof data.conversation_id === 'string' &&
    typeof data.host_id === 'string' &&
    isOneOf(data.tool_name, [
      ToolName.ListDir,
      ToolName.ReadFile,
      ToolName.SystemInfo,
      ToolName.RunCommand,
    ]) &&
    isObject(data.tool_params) &&
    typeof data.ai_analysis === 'string' &&
    typeof data.version === 'number'
  )
}

/** 校验是否为合法的 ApprovalResponse 载荷（V2：含 modify 决定） */
export function isApprovalResponse(data: unknown): data is ApprovalResponse {
  if (!isObject(data)) return false
  return (
    typeof data.approval_id === 'string' &&
    isOneOf(data.decision, [ApprovalDecision.Approve, ApprovalDecision.Cancel, ApprovalDecision.Modify])
  )
}

/** 校验是否为合法的 AiStream 载荷（V2：含 context_notice/attempt_reset） */
export function isAiStream(data: unknown): data is AiStream {
  if (!isObject(data)) return false
  return (
    isOneOf(data.type, [
      AiStreamType.UserMessage,
      AiStreamType.ThinkingDelta,
      AiStreamType.AnswerDelta,
      AiStreamType.ToolCall,
      AiStreamType.ToolResult,
      AiStreamType.Final,
      AiStreamType.Error,
      AiStreamType.ContextNotice,
      AiStreamType.AttemptReset,
    ]) && typeof data.conversation_id === 'string'
  )
}
