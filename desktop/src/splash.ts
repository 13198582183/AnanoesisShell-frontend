/**
 * 启动画面 splash（任务 4.3，design D10，spec「启动画面与开发者署名」）。
 *
 * 纯本地 HTML/CSS（不依赖后端——后端起不来时它还要承载错误态）：
 * - 无边框、不可调整、居中、深色基线（#0d1117 / #c9d1d9 / #58a6ff）；
 * - 三要素：应用名 AnanoesisShell、宗旨「让 Linux 运维不再困难」、署名「李仔文 / liziwen」；
 * - 动效为 CSS 透明度扫掠 + 进度指示点，无视频资产/splash 原生库；
 * - 生命周期：whenReady 即显 → 主窗 loadURL 成功淡出关闭 →
 *   启动失败/止损切换错误面板（原因摘要＋重试/退出），绝不静默消失。
 */
import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { desktopLogPath } from './backend-process';

const SPLASH_WIDTH = 480;
const SPLASH_HEIGHT = 320;

/** 页面双面板：默认 loading 可见；错误态由主进程注入原因后切换。 */
const SPLASH_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AnanoesisShell</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    background: #0d1117; color: #c9d1d9; overflow: hidden; user-select: none;
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 260ms ease-out;
  }
  .panel { display: none; width: 100%; text-align: center; padding: 0 32px; box-sizing: border-box; }
  .panel.active { display: block; }
  .brand { font-size: 30px; font-weight: 600; letter-spacing: 1px; color: #c9d1d9; position: relative; display: inline-block; overflow: hidden; }
  .brand em { font-style: normal; color: #58a6ff; }
  /* 透明度扫掠：一条高光从左到右反复掠过应用名 */
  .brand::after {
    content: ""; position: absolute; top: 0; left: -60%; width: 45%; height: 100%;
    background: linear-gradient(105deg, transparent, rgba(88,166,255,.28), transparent);
    animation: sweep 1.8s ease-in-out infinite;
  }
  @keyframes sweep { 0% { left: -60%; } 60%, 100% { left: 120%; } }
  .motto { margin-top: 14px; font-size: 14px; color: #8b949e; }
  .credit { margin-top: 26px; font-size: 12px; color: #58a6ff; opacity: .85; }
  .dots { margin-top: 22px; display: flex; gap: 8px; justify-content: center; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: #58a6ff; opacity: .25; animation: blink 1.2s infinite; }
  .dots i:nth-child(2) { animation-delay: .2s; }
  .dots i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 100% { opacity: .25; } 40% { opacity: 1; } }
  /* 错误面板 */
  .err-title { font-size: 20px; color: #f85149; font-weight: 600; }
  .err-reason {
    margin: 16px auto 0; max-width: 400px; max-height: 96px; overflow: auto; text-align: left;
    font-size: 12px; line-height: 1.6; color: #c9d1d9; background: #161b22;
    border: 1px solid #30363d; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap;
  }
  .err-log { margin-top: 10px; font-size: 11px; color: #8b949e; }
  .err-actions { margin-top: 20px; display: flex; gap: 12px; justify-content: center; }
  button {
    font: inherit; padding: 6px 22px; border-radius: 6px; cursor: pointer;
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
  }
  button:hover { border-color: #58a6ff; }
  button.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
</style>
</head>
<body>
  <div id="loading" class="panel active">
    <div class="brand">Ananoesis<em>Shell</em></div>
    <div class="motto">让 Linux 运维不再困难</div>
    <div class="dots"><i></i><i></i><i></i></div>
    <div class="credit">李仔文 / liziwen</div>
  </div>
  <div id="error" class="panel">
    <div class="err-title">后端未能启动</div>
    <pre id="err-reason" class="err-reason"></pre>
    <div class="err-log">日志：__LOG_PATH__</div>
    <div class="err-actions">
      <button id="btn-retry" class="primary">重试</button>
      <button id="btn-quit">退出</button>
    </div>
  </div>
  <script>
    window.ananoesisSplash = {
      showError(reason) {
        document.getElementById('err-reason').textContent = reason;
        document.getElementById('loading').classList.remove('active');
        document.getElementById('error').classList.add('active');
      },
      fade() { document.body.style.opacity = '0'; },
    };
    window.addEventListener('DOMContentLoaded', () => {
      document.getElementById('btn-retry').addEventListener('click', () => {
        if (window.shellSplash) window.shellSplash.retry();
      });
      document.getElementById('btn-quit').addEventListener('click', () => {
        if (window.shellSplash) window.shellSplash.quit();
      });
    });
  </script>
</body>
</html>`;

export interface SplashErrorActions {
  onRetry(): void;
  onQuit(): void;
}

export class SplashController {
  private closed = false;

  private constructor(private readonly win: BrowserWindow) {}

  static async create(): Promise<SplashController> {
    // HTML 落临时文件走 loadFile：避免 data: URL 长度/转义问题，也不给打包链加资产步骤
    const htmlPath = path.join(os.tmpdir(), 'ananoesis-shell', 'splash.html');
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, SPLASH_HTML.replace('__LOG_PATH__', desktopLogPath()), 'utf8');

    const win = new BrowserWindow({
      width: SPLASH_WIDTH,
      height: SPLASH_HEIGHT,
      frame: false,
      resizable: false,
      center: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#0d1117',
      title: 'AnanoesisShell',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'splash-preload.js'),
      },
    });
    const ctrl = new SplashController(win);
    win.once('ready-to-show', () => {
      win.show();
      ctrl.logEvent('启动画面已显示');
    });
    win.on('closed', () => ctrl.teardownIpc());
    await win.loadFile(htmlPath);
    return ctrl;
  }

  /** 启动失败/止损：切错误面板（原因摘要＋重试/退出），splash 绝不静默消失。 */
  showError(reason: string, actions: SplashErrorActions): void {
    if (this.closed || !this.winIsLive()) {
      return;
    }
    this.armIpc(actions);
    void this.win.webContents
      .executeJavaScript(`window.ananoesisSplash.showError(${JSON.stringify(reason)})`)
      .then(() => this.logEvent(`错误面板呈现：${reason}`))
      .catch(() => this.logEvent(`错误面板注入失败：${reason}`));
  }

  /** 主窗就绪：淡出并关闭（幂等，二次调用不动作）。 */
  fadeClose(): void {
    if (this.closed || !this.winIsLive()) {
      this.closed = true;
      return;
    }
    this.closed = true;
    this.logEvent('主窗就绪，启动画面退场');
    void this.win.webContents.executeJavaScript('window.ananoesisSplash.fade()').catch(() => undefined);
    // CSS 过渡 260ms，稍作停留再真正关窗
    setTimeout(() => {
      if (this.winIsLive()) {
        this.win.close();
      }
    }, 300);
  }

  isClosed(): boolean {
    return this.closed;
  }

  private winIsLive(): boolean {
    return !this.win.isDestroyed();
  }

  private armIpc(actions: SplashErrorActions): void {
    // 重复 showError（重试再失败）时先清旧监听，避免回调串台
    ipcMain.removeAllListeners('splash:retry');
    ipcMain.removeAllListeners('splash:quit');
    ipcMain.once('splash:retry', () => {
      this.teardownIpc();
      actions.onRetry();
    });
    ipcMain.once('splash:quit', () => {
      this.teardownIpc();
      actions.onQuit();
    });
  }

  private teardownIpc(): void {
    ipcMain.removeAllListeners('splash:retry');
    ipcMain.removeAllListeners('splash:quit');
  }

  private logEvent(line: string): void {
    try {
      fs.appendFileSync(desktopLogPath(), `${new Date().toISOString()} [splash] ${line}\n`);
    } catch {
      /* 日志失败不阻塞呈现 */
    }
    console.log(`[splash] ${line}`);
  }
}
