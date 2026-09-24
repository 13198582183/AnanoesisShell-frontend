/**
 * 后端进程监管（任务 4.2，design D4/D5，spec「崩溃检测与有界恢复」）。
 *
 * 两条纪律：
 * 1. 正常退出 MUST 走优雅通道：shuttingDown 标志 → GET /?tk= 引导取票 →
 *    POST /internal/shutdown（Windows 下 kill 不跑 JVM shutdown hook，
 *    graceful 只能经 D4 停止通道触发）→ 等待 exit 上限 10s → 超时 kill 兜底；
 * 2. 非预期 exit 走有界自动恢复：1s/2s/4s 退避重启；10 分钟窗口累计 3 次
 *    即止损（绝不无限循环拉起），止损事实经 hook 上报——splash 错误面板
 *    在任务 4.3 接入呈现，本层只保证状态机正确与日志可查。
 */
import { LaunchedBackend, launchBackend, requestShutdown } from './backend-process';
import type { BackendLayout } from './launch-layout';

/** 退避序列：第 1/2/3 次重启分别等 1s/2s/4s（spec「有界恢复」）。 */
const RESTART_DELAYS_MS = [1000, 2000, 4000];
/** 止损窗口：10 分钟内累计重启达上限即放弃。 */
const GIVEUP_WINDOW_MS = 10 * 60 * 1000;
const GIVEUP_MAX_RESTARTS = 3;
/** 优雅关闭等待上限（design D4：10s 后升级为强制终止并记录）。 */
const SHUTDOWN_WAIT_MS = 10_000;

export interface SupervisorHooks {
  /** 每次后端 health=UP 都回调（首启与重启；重启时主窗据此重新持票引导） */
  onBackendUp(backend: LaunchedBackend): void;
  /** 达到止损上限：呈现由 4.3 splash 错误面板接管 */
  onGiveUp(reason: string): void;
  /** 统一日志出口（desktop.log） */
  log(line: string): void;
}

export class BackendSupervisor {
  private backend: LaunchedBackend | null = null;
  private exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
  private shuttingDown = false;
  private givenUp = false;
  private restarts: number[] = [];

  constructor(private readonly layout: BackendLayout, private readonly hooks: SupervisorHooks) {}

  /** 首次拉起；失败直接上抛（启动失败呈现属 4.3/4.4 的路径，不算崩溃重启）。 */
  async start(): Promise<void> {
    const backend = await launchBackend(this.layout);
    this.attach(backend);
    this.hooks.onBackendUp(backend);
  }

  /** 崩溃监管：非退出流程中的 exit 一律走退避重启状态机。 */
  private handleUnexpectedExit(why: string): void {
    if (this.shuttingDown || this.givenUp) {
      return; // 壳主动关闭或已止损：不重启
    }
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < GIVEUP_WINDOW_MS);
    if (this.restarts.length >= GIVEUP_MAX_RESTARTS) {
      this.givenUp = true;
      const reason = `后端在 10 分钟窗口内非预期退出 ${this.restarts.length} 次（最近：${why}），已停止自动恢复`;
      this.hooks.log(`[supervisor] ${reason}`);
      this.hooks.onGiveUp(reason);
      return;
    }
    const delay = RESTART_DELAYS_MS[Math.min(this.restarts.length, RESTART_DELAYS_MS.length - 1)];
    this.restarts.push(now);
    this.hooks.log(`[supervisor] ${why}；${delay}ms 后第 ${this.restarts.length} 次自动重启`);
    setTimeout(() => {
      launchBackend(this.layout)
        .then((backend) => {
          this.attach(backend);
          this.hooks.onBackendUp(backend);
        })
        .catch((err: unknown) => {
          // 重启失败视同一次非预期退出，继续状态机（含止损判定）
          this.handleUnexpectedExit(`重启失败：${String((err as Error)?.message ?? err)}`);
        });
    }, delay);
  }

  private attach(backend: LaunchedBackend): void {
    this.backend = backend;
    this.exitListener = (code, signal) => {
      if (this.shuttingDown) {
        return;
      }
      this.handleUnexpectedExit(`后端进程退出 code=${code} signal=${signal}`);
    };
    backend.child.once('exit', this.exitListener);
  }

  private detachExitListener(): void {
    if (this.backend && this.exitListener) {
      this.backend.child.off('exit', this.exitListener);
    }
    this.exitListener = null;
  }

  /**
   * 错误面板“重试”入口（任务 4.3）：收掉可能残留的后端（如 health 超时
   * 但进程未退），先摘 exit 监听再 kill 防误入崩溃重启状态机，重置止损态重新拉起。
   */
  async retryStart(): Promise<void> {
    this.detachExitListener();
    const backend = this.backend;
    if (backend && backend.child.exitCode === null && backend.child.signalCode === null) {
      backend.child.kill();
      await this.waitForExit(backend, 3000);
    }
    this.backend = null;
    this.givenUp = false;
    this.restarts = [];
    await this.start();
  }

  /**
   * 优雅关闭（任务 4.2 前半）。幂等：二次调用直接等待同一流程。
   * 任何一步失败都不阻塞收编——最终保证是不留孤儿进程。
   */
  async shutdown(): Promise<void> {
    this.hooks.log('[supervisor] shutdown 进入');
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    const backend = this.backend;
    if (!backend || backend.child.exitCode !== null || backend.child.signalCode !== null) {
      this.hooks.log('[supervisor] 后端进程已不在，无需关闭');
      return; // 进程已经没了，无事可做
    }
    try {
      await requestShutdown(backend.port, backend.token);
      this.hooks.log('[supervisor] POST /internal/shutdown 已受理（202），等待进程退出…');
    } catch (err) {
      this.hooks.log(`[supervisor] 优雅关闭请求失败：${String((err as Error)?.message ?? err)}，转超时兜底`);
    }
    const exited = await this.waitForExit(backend, SHUTDOWN_WAIT_MS);
    if (!exited) {
      this.hooks.log(`[supervisor] ${SHUTDOWN_WAIT_MS / 1000}s 内未退出，强制 kill（pid=${backend.child.pid}）`);
      backend.child.kill();
      // kill 后仍给短窗口落定，避免退出流程无意义挂起
      if (!(await this.waitForExit(backend, 3000))) {
        this.hooks.log(`[supervisor] kill 后仍未确认退出，放弃等待（pid=${backend.child.pid}）`);
      }
    }
  }

  /** 当前是否处于关停/止损态（main.ts 拦截 before-quit 时用）。 */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  private waitForExit(backend: LaunchedBackend, ms: number): Promise<boolean> {
    const child = backend.child;
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.off('exit', onExit);
        resolve(false);
      }, ms);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once('exit', onExit);
    });
  }
}
