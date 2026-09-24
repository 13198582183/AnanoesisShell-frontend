/**
 * 本机后端进程的拉起与就绪等待（任务 4.1，design D3/D6）。
 *
 * 链路：随机空闲端口探测 → 生成 256bit 启动令牌 → spawn 捆绑 JRE 直跑
 * Spring Boot fat jar（desktop profile + 令牌经 env 注入 + 输出落 desktop.log）
 * → 轮询 /actuator/health 至 status=UP。
 *
 * 安全要点（与后端 DesktopGuard 对齐）：
 * - 令牌 MUST 经环境变量注入而非命令行——Windows 命令行对同机任意进程
 *   `Get-CimInstance Win32_Process` 可见，env 只对该子进程可见（spec「调用须持票」）；
 * - 端口仅回环：后端 application.yml 默认 server.address=127.0.0.1（任务 2.5），
 *   壳不传覆盖参数，不给局域网留任何暴露面；
 * - health 探测不携带任何凭据：守卫态下后端仅放行 GET health 且
 *   show-details=never，就绪判定只看 status。
 */
import { ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

import type { BackendLayout } from './launch-layout';

/** 就绪等待上限：慢盘首启（建库 + Flyway）也要给足余量。 */
export const HEALTH_TIMEOUT_MS = 90_000;
/** 轮询间隔：本机回环，500ms 足够密集而不扰启动。 */
const HEALTH_POLL_INTERVAL_MS = 500;

export interface LaunchedBackend {
  child: ChildProcess;
  port: number;
  /** 一次性启动令牌（hex），主窗口经 ?tk= 引导换发会话票 */
  token: string;
}

/** 桌面壳统一日志文件（design D5 止损提示口径：%USERPROFILE%\.ananoesis\logs\desktop.log）。 */
export function desktopLogPath(homedir: string = os.homedir()): string {
  return path.join(homedir, '.ananoesis', 'logs', 'desktop.log');
}

/** 探测一个当前空闲的回环端口（listen 0 让系统分配，随即释放）。 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr !== null) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('空闲端口探测失败')));
      }
    });
  });
}

/** 拉起后端并等待 health=UP；期间子进程提前退出则立即失败（不空等超时）。 */
export async function launchBackend(layout: BackendLayout): Promise<LaunchedBackend> {
  const port = await findFreePort();
  const token = crypto.randomBytes(32).toString('hex');

  const logFile = desktopLogPath();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n===== ${new Date().toISOString()} 桌面壳拉起后端（port=${port}）=====\n`);

  const child = spawn(
    layout.javaExe,
    [
      '-jar', layout.jarPath,
      `--server.port=${port}`,
      `--ananoesis.desktop.dist-dir=${layout.distDir}`,
    ],
    {
      env: {
        ...process.env,
        // 令牌经 env 注入（不进命令行）；profile 同样经 env，保持命令行干净
        ANANOESIS_LAUNCHER_TOKEN: token,
        SPRING_PROFILES_ACTIVE: 'desktop',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    },
  );
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });
  child.on('error', (err) => logStream.write(`[shell] spawn 失败: ${err?.message ?? err}\n`));

  await waitForHealth(port, child);
  return { child, port, token };
}

/** GET /actuator/health 轮询至 status=UP；连接拒绝类错误视为"尚未就绪"继续等。 */
export function waitForHealth(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const failEarly = (msg: string) => {
      clearTimeout(timer);
      reject(new Error(msg));
    };
    const poll = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/actuator/health', timeout: 2000 },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode === 200 && parseUp(body)) {
              resolve();
            } else {
              schedule();
            }
          });
        },
      );
      req.on('error', schedule); // ECONNREFUSED = 还没起来，正常等待
      req.on('timeout', () => {
        req.destroy();
        schedule();
      });
    };
    const schedule = () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        // 进程已死就不可能再 UP：立即失败，交由上层呈现
        return failEarly(`后端进程提前退出（code=${child.exitCode} signal=${child.signalCode}）`);
      }
      if (Date.now() > deadline) {
        return failEarly(`后端就绪等待超时（${HEALTH_TIMEOUT_MS / 1000}s）`);
      }
      timer = setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
    };
    let timer: NodeJS.Timeout;
    child.once('exit', () => schedule());
    poll();
  });
}

/** 只认 status=UP；health 在守卫态是 details=never 的最小 JSON。 */
function parseUp(body: string): boolean {
  try {
    return (JSON.parse(body) as { status?: string }).status === 'UP';
  } catch {
    return false;
  }
}

/**
 * 请求后端优雅关闭（design D4，任务 4.2）：先 GET /?tk= 引导换发会话票
 * （/internal/shutdown 受守卫持票约束，壳自己也要走同一道授权门），
 * 再 POST /internal/shutdown。返回是否拿到 202；失败抛错由监管层兜底 kill。
 */
export async function requestShutdown(port: number, token: string): Promise<void> {
  const cookie = await bootstrapSessionCookie(port, token);
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/internal/shutdown', method: 'POST', headers: { Cookie: cookie }, timeout: 5000 },
      (res) => {
        res.resume(); // 丢弃响应体，让连接干净结束
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('shutdown 请求超时')));
    req.end();
  });
  if (status !== 202) {
    throw new Error(`POST /internal/shutdown 返回 ${status}（预期 202）`);
  }
}

/** GET /?tk= 命中守卫引导分支，从 302 的 Set-Cookie 里取会话票（不跟转发）。 */
function bootstrapSessionCookie(port: number, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: `/?tk=${encodeURIComponent(token)}`, timeout: 5000 },
      (res) => {
        res.resume();
        res.on('end', () => {
          const setCookie = res.headers['set-cookie'];
          const sid = setCookie && setCookie.length > 0 ? setCookie[0].split(';')[0] : undefined;
          if (res.statusCode === 302 && sid) {
            resolve(sid);
          } else {
            reject(new Error(`引导失败 status=${res.statusCode} cookie=${sid ? 'yes' : 'no'}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('引导请求超时')));
  });
}
