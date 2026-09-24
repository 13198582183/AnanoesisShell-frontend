/**
 * 主窗口创建与导航边界（任务 4.1，design D2/D3，spec「主界面加载与内容边界」）。
 *
 * 安全基线：
 * - contextIsolation:true + nodeIntegration:false + 空 preload：
 *   页面内容（含模型回复与远端终端输出这类不可信文本）永远拿不到 Node 能力，
 *   窗口内不存在"本机文件写入或任意程序执行"的通道；
 * - will-navigate 仅放行同源（本后端 127.0.0.1:{port}）：窗口不被诱导跳外站；
 * - setWindowOpenHandler 一律 deny：新窗口请求不产生无监管的第二浏览器进程；
 * - show:false + did-finish-load 后才显示：不留白屏瞬间（任务 4.3 splash
 *   接管启动期后，这一条继续保证主窗自身不闪白）。
 */
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { desktopLogPath } from './backend-process';

/** 主窗尺寸取开发态 3000 页面常用工作尺寸；不持久化窗口状态（Non-Goal）。 */
const MAIN_WINDOW_WIDTH = 1280;
const MAIN_WINDOW_HEIGHT = 800;

/**
 * 当前放行同源（崩溃重启后端口会变，任务 4.2）。
 * 必须用可变绑定而非闭包常量：否则新后端 loadURL 会被 will-navigate 掐死。
 */
let appOrigin = '';

/** 更新同源放行 origin（创建窗口与崩溃重启引导前都必须先调）。 */
export function setAllowedAppOrigin(origin: string): void {
  appOrigin = origin;
}

/**
 * 创建主窗并持票引导：loadURL 带 ?tk= 命中后端守卫的引导分支，
 * 校验通过换发 HttpOnly 会话 Cookie 并 302 回不带票的 /（后端负责去票）。
 */
export function createAndLoadMainWindow(port: number, token: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    title: 'AnanoesisShell',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const origin = `http://127.0.0.1:${port}`;
  setAllowedAppOrigin(origin);
  // 窗口内导航：只允许同源（含崩溃重启后的新端口）；任何外站直接掐断
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameAppOrigin(url, appOrigin)) {
      event.preventDefault();
    }
  });
  // 新窗口请求（target=_blank / window.open）：一律拒绝，页面不产生逃逸窗口
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  // 引导成功的确证：302 去票后的最终 URL + 页面自身 title（401 空页拿不到
  // dist 的 <title>AnanoesisShell</title>），一并落 desktop.log 供冒烟取证。
  // 注意用持久监听而非 once：崩溃重启引导（任务 4.2）需要再次取证
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) {
      return;
    }
    void win.webContents
      .executeJavaScript('document.title')
      .then((title) => {
        fs.appendFileSync(
          desktopLogPath(),
          `[shell] 主窗口加载完成 url=${win.webContents.getURL()} title=${JSON.stringify(title ?? '')}\n`,
        );
      })
      .catch(() => {
        /* 页面已导航走，取证失败不影响功能 */
      });
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // 仅主框架失败才需要声张（子资源失败由页面自身呈现）；4.3 splash 落地后升级为错误面板
    if (isMainFrame) {
      console.error(`[shell] 主页面加载失败 code=${code} desc=${desc} url=${url}`);
    }
  });

  return win.loadURL(`${origin}/?tk=${encodeURIComponent(token)}`).then(() => win);
}

function isSameAppOrigin(url: string, appOrigin: string): boolean {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false; // 非法 URL 不放行
  }
}
