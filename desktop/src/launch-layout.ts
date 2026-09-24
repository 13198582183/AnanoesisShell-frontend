/**
 * 后端产物路径解析（任务 4.1，design D6/D9）。
 *
 * 生产布局契约（与任务 5.1 组装脚本互为钉住）：electron-builder 把三样东西
 * 经 extraResources 摆进安装目录的 resources/ 下——
 *   runtime/bin/java.exe   捆绑的 Temurin JRE 17
 *   backend/app.jar        Spring Boot fat jar（改名以隔离版本号漂移）
 *   dist/                  vite 构建产物（后端以 dist-dir 参数外置托管）
 *
 * 开发态冒烟经环境变量覆盖三项（ANANOESIS_DESKTOP_JAVA / _JAR / _DIST），
 * 让壳可以指向本机已构建的 jar 与 frontend/dist，无需完整安装包。
 */
import * as path from 'path';

export interface BackendLayout {
  /** java.exe 绝对路径 */
  javaExe: string;
  /** 后端 fat jar 绝对路径 */
  jarPath: string;
  /** 前端 dist 目录绝对路径（传给 ananoesis.desktop.dist-dir） */
  distDir: string;
}

/** 解析后端与前端产物的落位；env 覆盖优先，其次生产 resources 布局。 */
export function resolveLayout(
  resourcesPath: string = process.resourcesPath,
  env: NodeJS.ProcessEnv = process.env,
): BackendLayout {
  return {
    javaExe: env.ANANOESIS_DESKTOP_JAVA ?? path.join(resourcesPath, 'runtime', 'bin', 'java.exe'),
    jarPath: env.ANANOESIS_DESKTOP_JAR ?? path.join(resourcesPath, 'backend', 'app.jar'),
    distDir: env.ANANOESIS_DESKTOP_DIST ?? path.join(resourcesPath, 'dist'),
  };
}
