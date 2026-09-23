# AnanoesisShell 前端

AI 驱动远程终端（AnanoesisShell）的前端：多 tab 工作区（同一服务器每次连接独立 tab）、单一 xterm 时间线（Shell/Agent 双模式内联输入）、审批浮动弹窗、SFTP 文件站与历史面板。

> 真相源：REST 契约 `../contract/openapi.yaml`（生成客户端），WS 契约 `../contract/asyncapi.yaml`（手写类型 + 对齐测试）。工程规范见主仓库 `.qoder/rules/frontend-ui.md`。

## 技术栈

| 项 | 选型 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`）· TypeScript · Vite 5 |
| 状态 | Pinia（工作区 tab、主机/模型配置、设置）；路由 vue-router + KeepAlive（切页保连接保历史） |
| 终端 | `@xterm/xterm` 5 + fit 插件；每 tab 独立终端实例，输出按 session/conversation 路由防串台 |
| WS | `src/ws/ws-client.ts` 的 `WsChannel` 通道工厂（term / ai / approval 三通道，snake_case 契约原样） |
| REST | `src/api/generated/` openapi-generator 产物（不手改）+ `src/api/index.ts` 出口 |
| 测试 | Vitest + @vue/test-utils + jsdom |

## 目录地图（`src/`）

- `views/WorkspaceView.vue` — 工作区编排：多 tab、连接生命周期、AI 流文本写入、审批队列、`stop_turn` 本地闭环
- `components/terminal/TerminalTimeline.vue` — 单一 xterm 时间线：Shell/Agent 输入路由、Ctrl+C（生成态升级为打断）、断线按 r 重连
- `stores/workspaces.ts` — tab 元数据持久化（sessionId/controlToken 不持久）
- `types/ws-messages.ts` — WS 帧类型（与 asyncapi 对齐，含 `stop_turn`）；`runtime/` — 通道订阅与重连

## 运行与测试

```powershell
npm install
npm run dev          # 开发（端口 3000，代理 /api 与 /ws → 后端 18080）
npm test             # 全量单测（vitest run）
npm run type-check   # vue-tsc 零错误
npm run build        # 生产构建
npm run codegen      # 契约变更后重新生成 REST 客户端
```

提交前门禁：`test`、`type-check`、`build` 三者全绿。
