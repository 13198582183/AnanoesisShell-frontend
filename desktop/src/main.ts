/**
 * AnanoesisShell 桌面壳主进程入口（任务 4.1/4.2，design D2/D3/D4/D5/D10）。
 *
 * 启动链路：单实例锁 → 监管器拉起本机后端（捆绑 JRE、desktop profile、
 * 令牌经 env）→ health 就绪后创建主窗并持票引导同源页面；
 * 运行期非预期退出走 1s/2s/4s 退避重启（10 分钟 3 次止损，呈现归 4.3 splash）；
 * 退出经 POST /internal/shutdown 优雅收编，超时 kill 兜底，任何路径不留孤儿。
 */
import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';

import { LaunchedBackend, desktopLogPath } from './backend-process';
import { BackendSupervisor } from './backend-supervisor';
import { createAndLoadMainWindow, setAllowedAppOrigin } from './main-window';
import { resolveLayout } from './launch-layout';
import { SplashController } from './splash';

let mainWindow: BrowserWindow | null = null;
let supervisor: BackendSupervisor | null = null;
let splash: SplashController | null = null;
/** 故障呈现回路（splash 错误面板），在 whenReady 内初始化后供引导失败回调使用。 */
let presentFailure: (reason: string) => void = (reason) => {
  console.error(`[shell] 故障（splash 未就绪）：${reason}`);
};

/** 后端就绪（首启或崩溃重启）：无窗建窗，有窗重新持票引导（新进程票仓与端口都已变）。 */
// 引导失败的呈现由接线处在外部 catch（需要 presentFailure 回路，见 whenReady 段）
function onBackendUp(backend: LaunchedBackend): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 重启后端口会变：先更新同源放行，再引导（否则 will-navigate 掐死自己）
    setAllowedAppOrigin(`http://127.0.0.1:${backend.port}`);
    void mainWindow
      .loadURL(`http://127.0.0.1:${backend.port}/?tk=${encodeURIComponent(backend.token)}`)
      .then(() => splash?.fadeClose())
      .catch((err: unknown) =>
        presentFailure(`重启后主窗引导失败：${String((err as Error)?.message ?? err)}`),
      );
  } else {
    void createAndLoadMainWindow(backend.port, backend.token)
      .then((win) => {
        mainWindow = win;
        // 主窗 loadURL 已成功（createAndLoadMainWindow 的语义），splash 淡出退场
        splash?.fadeClose();
        win.on('closed', () => {
          mainWindow = null;
          app.quit(); // 关窗即退出（托盘等增强体验是 Non-Goal）
        });
      })
      .catch((err: unknown) => {
        // health 已 UP 但页面引导失败：同样交给错误面板，不白屏不静默
        presentFailure(`主窗口引导失败：${String((err as Error)?.message ?? err)}`);
      });
  }
}

// ==================================================================
// 单实例锁（spec「单实例运行」）：第二实例唤起已有窗口后自行退出，
// 绝不出现两个窗口争夺同一数据目录、或各自拉起两个后端。
// ==================================================================
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // splash 先行（design D10）：启动即现，失败/止损时它就是错误承载物，
    // 不再用独立对话框；创建失败属于无可呈现的极端态，退而求其次走日志+退出
    try {
      splash = await SplashController.create();
    } catch (err) {
      console.error('[shell] splash 创建失败：', err);
    }

    const failurePresenter = (reason: string) => {
      const actions = {
        onRetry: () => {
          supervisor
            ?.retryStart()
            .catch((retryErr: unknown) =>
              failurePresenter(`重试失败：${String((retryErr as Error)?.message ?? retryErr)}`),
            );
        },
        onQuit: () => app.exit(1),
      };
      if (splash && !splash.isClosed()) {
        splash.showError(reason, actions);
      } else {
        // splash 已退场后才发生的止损（理论路径）：降级为日志可查 + 明确退出，
        // 不静默挂死；错误时机回归（4.4）验证的是 splash 存活的主路径
        try {
          fs.appendFileSync(desktopLogPath(), `${new Date().toISOString()} [shell] 无 splash 承载的故障：${reason}\n`);
        } catch {
          /* 忽略 */
        }
        app.exit(1);
      }
    };

    presentFailure = failurePresenter;

    supervisor = new BackendSupervisor(resolveLayout(), {
      onBackendUp,
      onGiveUp: (reason) => failurePresenter(reason),
      log: (line) => {
        // 监管事实必须落 desktop.log（冒烟与用户排障都以此为证据），
        // console 在打包后无终端挂载，仅作为开发期冗余
        try {
          fs.appendFileSync(desktopLogPath(), `${new Date().toISOString()} ${line}\n`);
        } catch {
          /* 日志失败不阻塞状态机 */
        }
        console.log(line);
      },
    });
    try {
      await supervisor.start();
    } catch (err) {
      // 启动失败：splash 错误面板呈现（原因摘要＋重试/退出），不白屏不静默退出
      presentFailure(String((err as Error)?.message ?? err));
    }
  });

  app.on('window-all-closed', () => app.quit());

  // 退出收编（任务 4.2）：关窗会连环触发多次 before-quit（quit → 自动关窗 →
  // window-all-closed → 再 quit），而 Electron 在第二次无拦截的 quit 中就会销毁
  // 进程、掐断在飞的 shutdown HTTP。因此收编期间一律 preventDefault，
  // 完成（或兜底超时）后用 app.exit 强制终止，它不再派发 before-quit。
  app.on('before-quit', (event) => {
    if (supervisor) {
      event.preventDefault();
      if (!supervisor.isShuttingDown()) {
        supervisor
          .shutdown()
          .catch((err) => console.error('[shell] 关闭监管异常：', err))
          .finally(() => app.exit(0));
      }
    }
  });
}
