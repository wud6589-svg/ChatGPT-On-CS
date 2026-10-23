# 在 macOS（Apple Silicon）上运行懒人客服

官方 Release 只有 Windows 安装包（`1.4.5.exe`）。策略进程 `assets/backend/__main__.exe` 不在开源仓库里（`.gitignore` 忽略了 `assets/backend/*`），也不能在 Apple Silicon 上运行。macOS 改为启动本仓库里的策略 worker，它使用原来的 Socket.IO 事件，不需要 Windows 虚拟机。

## 环境

- Apple Silicon Mac
- Node.js 18 或更新版本，以及 pnpm
- Google Chrome（拼多多客服窗口用系统 Chrome，不用内置 Windows 驱动）

## 从源码运行

```bash
pnpm install
pnpm start
```

开发和打包都会拉起 Mac 策略进程，Express 仍由 Electron 主进程监听（开发模式默认端口 `9999`）。首页应出现平台列表，其中包含 **拼多多**。

主窗口在 macOS 上默认约 1040×760，可以拖拽缩放（最小约 920×640）。Windows 仍是原来的 528×1024，且不能缩放。开发模式不会自动打开 DevTools；需要时用菜单 View → Toggle Developer Tools，或按 Alt+Command+I。

Windows 上的开发模式不变：仍然不在 `pnpm start` 里启动 `__main__.exe`，打包后的 Windows 程序仍用 `taskkill` 结束该进程。

## 添加拼多多店铺

1. 启动应用，等平台列表出现后点 **拼多多**。
2. 点右侧 **+** 新增一个客服。应用会用独立的 Chrome 用户目录打开  
   `https://mms.pinduoduo.com/chat-merchant/index.html`。
3. 在这个窗口里登录店铺。登录态保存在  
   `~/Documents/chatgpt-on-cs/chrome-profiles/`。
4. 回到懒人客服，点首页的开启按钮，取消暂停。
5. 在设置里配好关键词或大模型。买家消息会通过原来的 `messageService-getMessages` 事件交给主进程生成回复，再写回拼多多输入框。

千牛、抖店、京麦、淘宝等平台也会出现在列表里。新增后会打开对应网页并记住登录配置。微信、企业微信没有可用的网页工作台，需要自己打开 Mac 客户端。

Chrome 不在默认路径时，设置：

```bash
export COCS_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 打包

在 Mac 上执行（需要本机的 Xcode 命令行工具；当前配置不签名）：

```bash
pnpm package:mac
```

产物在 `release/build/`，架构是 `arm64`（dmg 和 zip）。第一次打开未签名应用时，若系统拦截，可在「系统设置 → 隐私与安全性」里允许，或执行：

```bash
xattr -cr "/Applications/懒人客服.app"
```

没有设置 `APPLE_ID` 时不会公证。

## 仍然做不到的事

- 上游没有 macOS 版 `__main__.exe`。Windows 那套界面自动化（千牛/微信桌面控件、ESC 全局暂停）不能原样搬过来。
- 拼多多自动回复依赖商家后台网页结构。页面改版后，窗口和登录仍然可用，自动识别消息可能会失败。运行日志里会留下匹配到的 class，便于之后改选择器。
- 其它网页平台目前只打开工作台，不会自动回复。
- Mac 策略不会发送图片或文件，转人工会在界面里提示，需要你在店铺后台手动处理。
