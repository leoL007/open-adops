# OpenAdOps 本地完整版安装

OpenAdOps 的正式使用方式是本地运行。每位使用者登录自己的 Codex 账号；项目数据保存在自己的浏览器中，仓库不会附带或共享任何账号凭证。

## 使用前准备

- Node.js 20 或更高版本
- Codex CLI
- 可使用 Codex 的 ChatGPT 账号
- 下载并解压完整的 OpenAdOps 文件夹

在 GitHub Release 的 Assets 中下载 `OpenAdOps-vX.Y.Z-local.zip`。不要下载单独的启动器，也不要把 GitHub Pages 当作正式版。

不要只复制 `.command` 或 `.cmd` 启动器；启动器需要与完整项目文件配合运行。

Codex CLI 支持使用 ChatGPT 账号登录。首次使用可运行：

```bash
codex login
```

官方说明：[Codex Authentication](https://learn.chatgpt.com/docs/auth)

## macOS

1. 下载并解压完整的 OpenAdOps Release。
2. 双击根目录中的 `打开 OpenAdOps.command`。
3. 如果 macOS 首次阻止运行，右键文件并选择“打开”。
4. 启动器会检查 Node.js、端口和本机服务，然后打开浏览器。
5. 终端窗口需要保持打开；按 `Control + C` 停止服务。

启动器也可以放到桌面。它会先检查自身所在文件夹，再检查 `~/Documents/Hypic/open-adops`；其他安装位置可通过 `OPENADOPS_HOME` 指定。

## Windows

1. 下载并解压完整的 OpenAdOps Release。
2. 双击根目录中的 `OpenAdOps.cmd`。
3. 启动器会检查 Node.js、Codex CLI 和登录状态。
4. 尚未登录时，按照浏览器提示登录自己的 ChatGPT / Codex 账号。
5. 登录完成后，本地服务启动并自动打开浏览器。
6. 命令窗口需要保持打开；关闭窗口或按 `Control + C` 停止服务。

Windows 启动器会检查自身所在文件夹，以及 `%USERPROFILE%\Documents\Hypic\open-adops`。其他安装位置可设置环境变量 `OPENADOPS_HOME`。

## 手动启动

macOS、Windows 和 Linux 都可以使用终端启动：

```bash
npm start
```

浏览器打开：`http://127.0.0.1:4173`

如果启动失败，运行：

```bash
npm run doctor
```

## 数据与账号边界

- 不要把 `~/.codex/auth.json`、API Key 或其他登录文件提交到 GitHub 或发给同事。
- 每位同事使用自己的 Codex 登录和模型额度。
- GitHub Pages 只提供 Mock 演示，不会调用本机 Codex。
- 客户真实数据只保存在当前浏览器；换电脑或清除浏览器数据前，先导出工作区备份。
