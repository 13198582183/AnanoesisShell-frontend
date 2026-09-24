/**
 * 预加载脚本占位。
 *
 * WHY 先留空文件：主进程 webPreferences.preload 指向它，骨架期即可
 * 走通完整窗口配置路径；后续若需受限的壳能力（如"在系统浏览器打开"）
 * 只在此经 contextBridge 最小暴露，绝不直通 ipcRenderer。
 */
export {};
