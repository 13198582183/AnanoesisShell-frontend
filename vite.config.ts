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

/**
 * WHY: 桌面形态 CSP（任务 3.2，design D2）。生产构建时注入 meta（dev 态不注入：
 * vite dev 以运行时内联 style 提供 HMR，严格 CSP 会杀死开发体验，而 dev 形态
 * 本就只服务本机开发者）。策略逐项最小化，全部基于代码实证而非猜测定稿：
 * - script 'self'：build 产物为纯外部 JS，无 eval/new Function（grep 实证）。
 * - style 必须补 'unsafe-inline'（打包后 AI 渲染丢配色 BUG 实证）：xterm DOM
 *   渲染器的全部着色规则（ANSI 16/256 色类、dim 的 50% 淡化色）写在
 *   document.createElement('style') 动态注入的 <style> 里（DomRenderer._injectCss），
 *   严格 style-src 'self' 会拦截它→思考（\x1b[2m）与回复退化成同一前景色。
 *   这是 xterm.js 官方文档对 DOM 渲染器的明确要求；per-span 颜色另走 CSSOM
 *   属性赋值（不受 CSP 管），被拦的只有动态样式表。风险面：本工程无 v-html、
 *   无不可信 HTML 注入路径，style 面的放宽不叠加 script 面。
 * - connect-src 补回环 ws：桌面形态页面是 http://127.0.0.1:{port}，WS 同源
 *   回环连接不能赌 Chromium 对 'self' 的 ws 扩展匹配，显式枚举回环主机；
 * - 无 worker/data:/blob 例外：工程未用 xterm webgl/canvas addon、无
 *   createObjectURL（均 grep 实证），SFTP 下载走同源相对路径导航，不占 CSP 面。
 */
const DESKTOP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const desktopCspPlugin = {
  name: 'desktop-csp-meta',
  apply: 'build' as const,
  transformIndexHtml() {
    // head 最前：CSP meta 只对先于它加载的资源之后生效，顺序不是风格问题而是正确性问题
    return [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: DESKTOP_CSP },
        injectTo: 'head-prepend' as const,
      },
    ]
  },
}

export default defineConfig({
  plugins: [vue(), desktopCspPlugin],
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
