/**
 * splash 预加载（任务 4.3，design D10）：仅暴露错误面板两个按钮的
 * fire-and-forget 通道，页面拿不到任何其余 Node/Electron 能力。
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('shellSplash', {
  retry: (): void => ipcRenderer.send('splash:retry'),
  quit: (): void => ipcRenderer.send('splash:quit'),
});
