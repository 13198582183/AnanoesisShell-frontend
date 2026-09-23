import type {
  TerminalInput,
  TerminalOutput,
  ApprovalRequest,
  ApprovalResponse,
  AiStream,
} from '@/types'
import { isTerminalOutput, isApprovalRequest, isAiStream } from '@/types'

/** 连接状态 */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected'

/**
 * 契约（asyncapi.yaml）定义的三个独立 WebSocket 通道路径。
 * WHY: Wave 1 曾假设"单连接 + type 字段多路复用"，与冻结契约不符，已按"契约为准"重构为
 * 三通道独立连接（/ws/terminal、/ws/approval、/ws/ai），每条通道各自维护连接状态与消息类型。
 * 后端 WebSocketConfiguration 注册端点为 /ws/terminal、/ws/approval、/ws/ai。
 */
export type WsChannelPath = '/ws/terminal' | '/ws/approval' | '/ws/ai'

export interface WsChannelOptions {
  /**
   * 覆盖默认的 URL 拼接方式（默认基于 window.location 拼同源 ws(s)://host/path，
   * 交由 Vite dev proxy / 生产反向代理转发到真实后端）。仅测试或特殊部署场景需要显式传入。
   */
  baseUrl?: string
}

/**
 * 单个 WebSocket 通道的泛型封装。
 * WHY: 三个通道（/terminal、/approval、/ai）的连接管理、收发、状态通知逻辑完全一致，
 * 仅"发送载荷类型"与"接收载荷类型 + 校验守卫"不同，用泛型 + 依赖注入的校验函数复用同一套实现，
 * 避免为每个通道写重复的 WebSocket 样板代码。
 */
export class WsChannel<TSend, TReceive> {
  private ws: WebSocket | null = null
  private _state: WsConnectionState = 'disconnected'
  private messageListeners = new Set<(msg: TReceive) => void>()
  private stateListeners = new Set<(state: WsConnectionState) => void>()

  constructor(
    private readonly path: WsChannelPath,
    private readonly validate: (data: unknown) => data is TReceive,
    private readonly options: WsChannelOptions = {},
  ) {}

  /** 当前连接状态 */
  get state(): WsConnectionState {
    return this._state
  }

  private buildUrl(): string {
    if (this.options.baseUrl) {
      return `${this.options.baseUrl}${this.path}`
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}${this.path}`
  }

  /**
   * 建立 WebSocket 连接。重复调用会被忽略（幂等），避免同一通道产生多个连接。
   */
  connect(): void {
    if (this.ws) return

    this.setState('connecting')
    this.ws = new WebSocket(this.buildUrl())

    this.ws.onopen = () => {
      this.setState('connected')
    }

    this.ws.onclose = () => {
      this.ws = null
      this.setState('disconnected')
    }

    this.ws.onerror = () => {
      // WHY: 错误后浏览器会自动触发 onclose，此处仅标记状态，具体清理逻辑交给 onclose
      this.setState('disconnected')
    }

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data)
    }
  }

  /** 主动断开连接 */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('disconnected')
  }

  /**
   * 发送消息（序列化为 JSON，字段名保持契约要求的 snake_case 原样）
   * @throws 未连接时抛出错误
   */
  send(msg: TSend): void {
    if (!this.ws || this._state !== 'connected') {
      throw new Error('WebSocket is not connected')
    }
    this.ws.send(JSON.stringify(msg))
  }

  /**
   * 注册消息监听器，返回取消订阅函数
   */
  onMessage(handler: (msg: TReceive) => void): () => void {
    this.messageListeners.add(handler)
    return () => {
      this.messageListeners.delete(handler)
    }
  }

  /**
   * 注册连接状态变更监听器，返回取消订阅函数
   */
  onStateChange(handler: (state: WsConnectionState) => void): () => void {
    this.stateListeners.add(handler)
    return () => {
      this.stateListeners.delete(handler)
    }
  }

  private setState(state: WsConnectionState): void {
    this._state = state
    for (const handler of this.stateListeners) {
      handler(state)
    }
  }

  private handleRawMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // WHY: 非法 JSON 静默忽略，防止单条坏消息导致整个通道崩溃
      return
    }

    if (!this.validate(parsed)) {
      return
    }

    for (const handler of this.messageListeners) {
      handler(parsed)
    }
  }
}

/**
 * 创建终端通道（/ws/terminal）：发送 TerminalInput，接收 TerminalOutput
 */
export function createTerminalChannel(options?: WsChannelOptions): WsChannel<TerminalInput, TerminalOutput> {
  return new WsChannel<TerminalInput, TerminalOutput>('/ws/terminal', isTerminalOutput, options)
}

/**
 * 创建审批通道（/ws/approval）：发送 ApprovalResponse，接收 ApprovalRequest
 */
export function createApprovalChannel(options?: WsChannelOptions): WsChannel<ApprovalResponse, ApprovalRequest> {
  return new WsChannel<ApprovalResponse, ApprovalRequest>('/ws/approval', isApprovalRequest, options)
}

/**
 * 创建 AI 通道（/ws/ai）：双向均为 AiStream，靠 type 字段区分方向与语义
 */
export function createAiChannel(options?: WsChannelOptions): WsChannel<AiStream, AiStream> {
  return new WsChannel<AiStream, AiStream>('/ws/ai', isAiStream, options)
}
