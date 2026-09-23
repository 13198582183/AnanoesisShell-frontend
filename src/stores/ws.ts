import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { WsConnectionState } from '@/ws'

/**
 * WebSocket 连接状态 Store
 * WHY: 全局共享连接状态，供导航栏指示灯、终端视图、AI 对话等多处消费
 */
export const useWsStore = defineStore('ws', () => {
  const connectionState = ref<WsConnectionState>('disconnected')

  function setConnectionState(state: WsConnectionState) {
    connectionState.value = state
  }

  return { connectionState, setConnectionState }
})
