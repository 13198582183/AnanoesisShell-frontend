# 自定义 NSIS 安装脚本钩子（经 electron-builder.yml 的 nsis.include 引用）。
# WHY 不放 build/：那是 build-desktop.ps1 每次构建全删重建的暂存位，固定资源放 installer/。

!macro customInstall
  # 升级安装修复：electron-builder 的 keepShortcuts 机制在覆盖安装时不重建桌面
  # 快捷方式，而 Explorer 图标缓存按「exe 路径+索引」复用旧位图——win.icon 换图后
  # 桌面 lnk 仍显示 Electron 默认图标（0.1.0 真机实证：开始菜单/exe 属性都新，唯桌面旧）。
  # 处理：无条件删旧 lnk 重建（内容参数与模板 addDesktopLink 完全一致），
  # 再发 SHCNE_UPDATEIMAGE+FLUSH 令 shell 丢弃图标缓存，ie4uinit -show 兜底（Win8+ 自带）。
  Delete "$newDesktopLink"
  CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  System::Call 'shell32::SHChangeNotify(i 0x00008000, i 0x00001000, p 0, p 0)'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x00001000, p 0, p 0)'
  ExecWait '$SYSDIR\ie4uinit.exe -show'
!macroend
