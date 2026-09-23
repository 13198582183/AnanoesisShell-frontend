import { createTerminalChannel, type WsChannel, type WsConnectionState } from '@/ws'
import {
  TerminalInputAction,
  TerminalOutputType,
  type TerminalInput,
  type TerminalOutput,
} from '@/types'

/**
 * 运行时事件——从 WS 输出转换为前端友好的驼峰格式。
 * WHY: WS 载荷保持契约 snake_case，但前端组件使用驼峰更自然，
 *      Runtime 负责这一层转换，隔离契约字段名变化对 UI 的影响。
 */
export interface RuntimeEvent {
  type: 'data' | 'error' | 'closed' | 'bound' | 'snapshot'
  sessionId?: string
  eventSeq?: number
  data?: string
  errorCode?: string
  message?: string
  endReason?: string
}

/** 创建 Runtime 所需的参数 */
export interface RuntimeOptions {
  sessionId: string
  controlToken: string
}

/** 事件处理回调 */
export type RuntimeEventHandler = (event: RuntimeEvent) => void

/**
 * WorkspaceRuntime（task 10.6）
 * WHY: 管理单个 workspace 的 WS 连接、事件订阅、输入发送、resize 同步。
 *      将 WsChannel 的底层细节（JSON 序列化、类型守卫、snake_case）封装为简洁的
 *      命令式 API，供 TerminalTimeline / WorkspaceView 消费。
 *
 * 关键语义：
 * - bind 帧：连接成功后提交 control_token 绑定到已有 session
 * - 快照去重：通过 event_seq 单调递增判断，重复事件不触发
 * - 零尺寸保护：隐藏 tab 时 cols/rows 为 0，不发 resize 避免服务端异常
 * - 资源释放：dispose 断开 WS 并清除所有监听器
 */
export class WorkspaceRuntime {
  private channel: WsChannel<TerminalInput, TerminalOutput> | null = null
  private unsubMessage: (() => void) | null = null
  private unsubState: (() => void) | null = null
  private handlers = new Set<RuntimeEventHandler>()
  private _connectionState: WsConnectionState = 'disconnected'
  /** 已处理的最大 event_seq，用于去重 */
  private lastEventSeq = 0
  /** bind 是否已发送 */
  private bound = false

  private readonly sessionId: string
  private readonly controlToken: string

  constructor(options: RuntimeOptions) {
    this.sessionId = options.sessionId
    this.controlToken = options.controlToken
  }

  /** 当前连接状态 */
  get connectionState(): WsConnectionState {
    return this._connectionState
  }

  /** 建立 WS 连接 */
  connect(): void {
    if (this.channel) return
    this._connectionState = 'connecting'
    this.bound = false

    this.channel = createTerminalChannel()
    this.unsubMessage = this.channel.onMessage((msg) => this.handleMessage(msg))
    this.unsubState = this.channel.onStateChange((state) => this.handleStateChange(state))
    this.channel.connect()
  }

  /** 注册事件监听器，返回取消订阅函数 */
  subscribe(handler: RuntimeEventHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  /** 发送终端输入到 PTY */
  sendInput(data: string): void {
    if (!this.channel || this._connectionState !== 'connected') return
    this.channel.send({
      action: TerminalInputAction.Input,
      session_id: this.sessionId,
      data,
    })
  }

  /**
   * 发送 resize 同步。
   * WHY: 隐藏实例（tab 不可见）cols/rows 为 0，不发 resize 避免服务端异常。
   */
  sendResize(cols: number, rows: number): void {
    if (!this.channel || this._connectionState !== 'connected') return
    // 零尺寸保护：隐藏 tab 时不发送
    if (cols <= 0 || rows <= 0) return
    this.channel.send({
      action: TerminalInputAction.Resize,
      session_id: this.sessionId,
      cols,
      rows,
    })
  }

  /** 关闭会话并断开连接 */
  closeSession(): void {
    if (this.channel && this._connectionState === 'connected') {
      this.channel.send({
        action: TerminalInputAction.Close,
        session_id: this.sessionId,
      })
    }
    this.disconnect()
  }

  /** 释放所有资源 */
  dispose(): void {
    this.disconnect()
    this.handlers.clear()
  }

  private disconnect(): void {
    this.unsubMessage?.()
    this.unsubMessage = null
    this.unsubState?.()
    this.unsubState = null
    this.channel?.disconnect()
    this.channel = null
    this._connectionState = 'disconnected'
  }

  private handleStateChange(state: WsConnectionState): void {
    this._connectionState = state
    if (state === 'connected' && !this.bound) {
      // 连接成功后发送 bind 帧提交 control_token
      this.bound = true
      this.channel?.send({
        action: TerminalInputAction.Bind,
        session_id: this.sessionId,
        control_token: this.controlToken,
      })
    }
  }

  private handleMessage(msg: TerminalOutput): void {
    // 快照去重：event_seq 单调递增，重复事件忽略
    if (msg.event_seq !== undefined && msg.event_seq <= this.lastEventSeq) {
      return
    }
    if (msg.event_seq !== undefined) {
      this.lastEventSeq = msg.event_seq
    }

    const event = this.toRuntimeEvent(msg)
    for (const handler of this.handlers) {
      handler(event)
    }
  }

  private toRuntimeEvent(msg: TerminalOutput): RuntimeEvent {
    switch (msg.type) {
      case TerminalOutputType.Data:
        return {
          type: 'data',
          sessionId: msg.session_id,
          eventSeq: msg.event_seq,
          data: msg.data,
        }
      case TerminalOutputType.Error:
        return {
          type: 'error',
          sessionId: msg.session_id,
          eventSeq: msg.event_seq,
          errorCode: msg.error_code,
          message: msg.message,
        }
      case TerminalOutputType.Closed:
        return {
          type: 'closed',
          sessionId: msg.session_id,
          eventSeq: msg.event_seq,
          endReason: msg.end_reason,
        }
      case TerminalOutputType.Bound:
        return {
          type: 'bound',
          sessionId: msg.session_id,
          eventSeq: msg.event_seq,
        }
      case TerminalOutputType.SubscriptionSnapshot:
        return {
          type: 'snapshot',
          sessionId: msg.session_id,
          eventSeq: msg.event_seq,
          data: msg.snapshot?.screen_buffer,
        }
      default:
        return { type: 'data', sessionId: msg.session_id, eventSeq: msg.event_seq }
    }
  }
}
