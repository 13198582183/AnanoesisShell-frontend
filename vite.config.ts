import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * WHY: 后端 dev 服务地址由指挥官指定为 http://localhost:18080（REST 前缀 /api；
 * WS 通道 /ws/terminal、/ws/approval、/ws/ai）。前端所有请求走同源相对路径，由此处 proxy
 * 转发到真实后端，避免前端代码硬编码后端地址（生产环境改用反向代理，行为一致）。
 */
const BACKEND_TARGET = 'http://localhost:18080'
const BACKEND_WS_TARGET = 'ws://localhost:18080'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
      '/ws/terminal': {
        target: BACKEND_WS_TARGET,
        ws: true,
        changeOrigin: true,
      },
      '/ws/approval': {
        target: BACKEND_WS_TARGET,
        ws: true,
        changeOrigin: true,
      },
      '/ws/ai': {
        target: BACKEND_WS_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
