import { describe, it, expect } from 'vitest'
import {
  isTerminalInput,
  isTerminalOutput,
  isApprovalRequest,
  isApprovalResponse,
  isAiStream,
  TerminalInputAction,
  TerminalOutputType,
  ApprovalDecision,
  AiStreamType,
  ErrorCode,
} from '@/types'

/**
 * WS 消息类型守卫测试
 * WHY: 严格对齐 contract/asyncapi.yaml（0.2.0-draft V2）定义的必填字段与枚举取值，
 *      运行时收到的 JSON 可能缺字段或含未知枚举值，需安全校验后再分发，避免脏数据
 *      传播到 UI 层。字段名与线格式（snake_case）完全一致，因为 WS 载荷不经过
 *      openapi-generator 的 FromJSON/ToJSON 转换，是直接 JSON.parse 的原样对象。
 */
describe('isTerminalInput 类型守卫', () => {
  it('合法的 open 动作（携带 host_id）返回 true', () => {
    expect(isTerminalInput({ action: 'open', host_id: 'host-1' })).toBe(true)
  })

  it('合法的 input 动作（携带 session_id + data）返回 true', () => {
    expect(isTerminalInput({ action: 'input', session_id: 'sess-1', data: 'ls\n' })).toBe(true)
  })

  it('合法的 close 动作（携带 session_id）返回 true', () => {
    expect(isTerminalInput({ action: 'close', session_id: 'sess-1' })).toBe(true)
  })

  it('V2：合法的 bind 动作（携带 session_id + control_token）返回 true', () => {
    expect(isTerminalInput({ action: 'bind', session_id: 'sess-1', control_token: 'token-123' })).toBe(true)
  })

  it('V2：合法的 resize 动作（携带 cols + rows）返回 true', () => {
    expect(isTerminalInput({ action: 'resize', session_id: 'sess-1', cols: 80, rows: 24 })).toBe(true)
  })

  it('缺少 action 字段返回 false', () => {
    expect(isTerminalInput({ host_id: 'host-1' })).toBe(false)
  })

  it('未知 action 值返回 false', () => {
    expect(isTerminalInput({ action: 'unknown' })).toBe(false)
  })

  it('null / 非对象返回 false', () => {
    expect(isTerminalInput(null)).toBe(false)
    expect(isTerminalInput('string')).toBe(false)
  })

  it('TerminalInputAction 枚举值与契约一致（V2 含 bind/resize）', () => {
    expect(TerminalInputAction).toEqual({
      Open: 'open',
      Input: 'input',
      Close: 'close',
      Bind: 'bind',
      Resize: 'resize',
    })
  })
})

describe('isTerminalOutput 类型守卫', () => {
  it('合法的 data 事件返回 true', () => {
    expect(isTerminalOutput({ type: 'data', session_id: 'sess-1', stream: 'stdout', data: 'hello' })).toBe(true)
  })

  it('合法的 error 事件（含 error_code/message）返回 true', () => {
    expect(isTerminalOutput({ type: 'error', error_code: 'auth_failed', message: '认证失败' })).toBe(true)
  })

  it('合法的 closed 事件（含 end_reason）返回 true', () => {
    expect(isTerminalOutput({ type: 'closed', end_reason: 'user_disconnect' })).toBe(true)
  })

  it('V2：合法的 bound 事件返回 true', () => {
    expect(isTerminalOutput({ type: 'bound', session_id: 'sess-1' })).toBe(true)
  })

  it('V2：合法的 subscription_snapshot 事件返回 true', () => {
    expect(isTerminalOutput({
      type: 'subscription_snapshot',
      session_id: 'sess-1',
      snapshot: { screen_buffer: '', event_tail: [], has_gap: false },
    })).toBe(true)
  })

  it('缺少 type 字段返回 false', () => {
    expect(isTerminalOutput({ session_id: 'sess-1' })).toBe(false)
  })

  it('未知 type 值返回 false', () => {
    expect(isTerminalOutput({ type: 'unknown' })).toBe(false)
  })

  it('TerminalOutputType 枚举值与契约一致（V2 含 bound/subscription_snapshot）', () => {
    expect(TerminalOutputType).toEqual({
      Data: 'data',
      Error: 'error',
      Closed: 'closed',
      Bound: 'bound',
      SubscriptionSnapshot: 'subscription_snapshot',
    })
  })
})

describe('isApprovalRequest 类型守卫', () => {
  const valid = {
    approval_id: 'apr-1',
    conversation_id: 'conv-1',
    host_id: 'host-1',
    tool_name: 'run_command',
    tool_params: { command: 'systemctl restart nginx' },
    ai_analysis: '需要重启 nginx',
    version: 1,
  }

  it('所有必填字段齐全时返回 true（V2：含 version）', () => {
    expect(isApprovalRequest(valid)).toBe(true)
  })

  it('缺少任一必填字段返回 false', () => {
    expect(isApprovalRequest({ ...valid, ai_analysis: undefined })).toBe(false)
    expect(isApprovalRequest({ ...valid, tool_params: undefined })).toBe(false)
    expect(isApprovalRequest({ ...valid, version: undefined })).toBe(false)
  })
})

describe('isApprovalResponse 类型守卫', () => {
  it('合法的 approve 决定返回 true', () => {
    expect(isApprovalResponse({ approval_id: 'apr-1', decision: 'approve' })).toBe(true)
  })

  it('合法的 cancel 决定返回 true', () => {
    expect(isApprovalResponse({ approval_id: 'apr-1', decision: 'cancel' })).toBe(true)
  })

  it('V2：合法的 modify 决定返回 true', () => {
    expect(isApprovalResponse({
      approval_id: 'apr-1', decision: 'modify',
      modified_command: 'systemctl status nginx', expected_version: 1,
    })).toBe(true)
  })

  it('未知 decision 值返回 false', () => {
    expect(isApprovalResponse({ approval_id: 'apr-1', decision: 'maybe' })).toBe(false)
  })

  it('ApprovalDecision 枚举值与契约一致（V2 含 Modify）', () => {
    expect(ApprovalDecision).toEqual({ Approve: 'approve', Cancel: 'cancel', Modify: 'modify' })
  })
})

describe('isAiStream 类型守卫', () => {
  it('合法的 user_message（客户端提交提问）返回 true', () => {
    expect(isAiStream({ type: 'user_message', conversation_id: 'conv-1', content: '帮我看看磁盘' })).toBe(true)
  })

  it('合法的 thinking_delta 返回 true', () => {
    expect(isAiStream({ type: 'thinking_delta', conversation_id: 'conv-1', content: '正在分析', segment: 'thinking' })).toBe(true)
  })

  it('V2：合法的 context_notice 返回 true', () => {
    expect(isAiStream({
      type: 'context_notice', conversation_id: 'conv-1',
      context_notice: { candidate_count: 60, retained_count: 30, estimated_tokens: 4000 },
    })).toBe(true)
  })

  it('V2：合法的 attempt_reset 返回 true', () => {
    expect(isAiStream({
      type: 'attempt_reset', conversation_id: 'conv-1',
      attempt_id: 'att-1', attempt_number: 1,
    })).toBe(true)
  })

  it('缺少 conversation_id 返回 false', () => {
    expect(isAiStream({ type: 'answer_delta' })).toBe(false)
  })

  it('未知 type 值返回 false', () => {
    expect(isAiStream({ type: 'unknown', conversation_id: 'conv-1' })).toBe(false)
  })

  it('AiStreamType 枚举值与契约一致（V2 含 context_notice/attempt_reset/stop_turn）', () => {
    expect(AiStreamType).toEqual({
      UserMessage: 'user_message',
      StopTurn: 'stop_turn',
      ThinkingDelta: 'thinking_delta',
      AnswerDelta: 'answer_delta',
      ToolCall: 'tool_call',
      ToolResult: 'tool_result',
      Final: 'final',
      Error: 'error',
      ContextNotice: 'context_notice',
      AttemptReset: 'attempt_reset',
    })
  })
})

describe('ErrorCode V2 扩展', () => {
  it('包含 V2 新增错误码', () => {
    expect(ErrorCode).toMatchObject({
      SessionControlRequired: 'session_control_required',
      SessionControlInvalid: 'session_control_invalid',
      TransferQuotaExceeded: 'transfer_quota_exceeded',
      TransferConflict: 'transfer_conflict',
      TransferTargetChanged: 'transfer_target_changed',
      ContextBudgetExceeded: 'context_budget_exceeded',
    })
  })
})
