<p align="center">
  <img src="assets/icon.png" width="112" height="112" alt="DSH 会话工作台图标">
</p>

<h1 align="center">DSH 会话工作台</h1>

<p align="center">管理和搜索 DeepSeek Harness 会话，让 Agent 在项目间分工、通信和移交任务。</p>

<p align="center">
  <a href="https://github.com/MindCastlePlayground/dsh-session-workbench/releases/latest">下载安装包</a> ·
  <a href="#agent-工具">Agent 工具</a> ·
  <a href="#从源码构建">从源码构建</a>
</p>

## 功能

- **会话整理** — 在「设置 → 会话管理」和侧栏菜单中归档、恢复、迁移会话，管理星标、标签和回收站。
- **全文搜索** — 在左侧栏搜索标题、用户消息、助手回复和文件名，点结果回到原文。全局搜索默认是 `Ctrl/Cmd+Alt+Q`，会话内搜索默认是 `Ctrl/Cmd+F`。
- **项目管理** — Agent 可以创建和重命名项目，在指定项目或默认聊天工作区开会话，并投递初始任务。
- **会话协作** — Agent 可以给其他会话发消息、读取历史、查询运行状态，或等指定消息处理完成。
- **会话迁移** — Agent 可以把会话移到另一项目，保留会话 ID 和消息历史。

## 安装

下载 [`dsh-session-workbench-1.2.0.tgz`](https://github.com/MindCastlePlayground/dsh-session-workbench/releases/download/v1.2.0/dsh-session-workbench-1.2.0.tgz)，进入下载目录并执行与你使用方式对应的一条命令。

```sh
# DSH Desktop
dsh plugin --profile desktop add ./dsh-session-workbench-1.2.0.tgz

# DSH Web
dsh plugin --profile web add ./dsh-session-workbench-1.2.0.tgz
```

安装后完全退出并重新启动对应的 DSH 宿主。如果同一 profile 已启用 `dsh-sessions-manager` 或 `dsh-chat-search`，先停用旧插件以避免路由、菜单或快捷键重复。工作台沿用原有的管理数据和搜索设置目录，无需复制会话文件。

**兼容性。** 项目与跨会话工具已在 DSH Web `0.2.1-rc.5` 验证。Desktop 可以按上述方式安装，当前版本的 Desktop 界面与真实模型自主调用尚未单独验证。

<details>
<summary>Windows 找不到 <code>dsh</code> 命令</summary>

Windows 默认安装位置可以通过 DSH Desktop 自带的 CLI 安装。Web 用户把下文的 `desktop` 改为 `web`。

```powershell
$dshApp = Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness'
$dshCli = Join-Path $dshApp 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
$previousElectronMode = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = '1'
try {
    & (Join-Path $dshApp 'DeepSeek Harness.exe') --expose-internals $dshCli plugin --profile desktop add ./dsh-session-workbench-1.2.0.tgz | Out-Host
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previousElectronMode
}
```

</details>

## 使用示例

安装后，从一个独立的 DSH 会话向 Agent 提出任务。

> 创建一个名为「发布核对」的项目，在里面开一个会话核对发布步骤。等那个会话完成后，读它的回复并汇总。最后把那个会话迁移到默认聊天工作区，如果需要排队，告诉我当前状态。

全局搜索默认查看最近 14 天，并索引每个会话最近 30 轮。可清空日期、把轮次设为 `0` 来取消对应限制。全局索引最多覆盖 400 个会话、800 万字符。

## Agent 工具

### 项目与会话

| 工具 | 参数与行为 |
| --- | --- |
| `workbench_project_list` | 列出项目 ID、名称和目录，并返回当前项目与默认聊天工作区。 |
| `workbench_project_create` | 传入 `name`。可用 `path` 指定宿主上的绝对路径，省略时从 DSH 数据目录分配独立目录。 |
| `workbench_project_rename` | 传入 `project_id` 和新 `name`。保留目录和会话。 |
| `workbench_session_create` | 传入 `project_id`。可用 `title` 命名，或用 `message` 投递初始任务。 |
| `workbench_session_move` | 传入 `session_id` 和 `target_project_id`。原会话位于其他项目时，带上 `source_project_id`。 |
| `workbench_session_move_status` | 传入 `session_id` 和目标 `project_id`，查询迁移是否排队或已经到达。 |

创建或迁移会话时，可用 `default` 选择默认聊天工作区。旧配置没有 DSH 原生默认工作区时，首次使用会创建专用的「默认聊天」工作区。

迁移会改变项目归属与工作目录。返回 `moved` 表示迁移完成，`already` 表示会话已在目标项目。如果 DSH 仍持有会话写锁，结果为 `queued`，宿主会在释放写锁后重试。若写锁持续到进程退出，请完全重启 DSH，再等队列处理后打开会话。

### 跨会话协作

| 工具 | 行为 |
| --- | --- |
| `workbench_session_list` | 查找其他未归档的独立会话，返回会话 ID 和运行状态。 |
| `workbench_session_send` | 投递文本并返回 `message_id`。目标会话未加载时会恢复运行。 |
| `workbench_session_history` | 分页读取已经写入的用户消息、会话间消息及助手回复。用 `next_before_seq` 读取更早内容。 |
| `workbench_session_status` | 查询运行、空闲、未加载或归档状态，以及最近结束的轮次。 |
| `workbench_session_wait` | 等待会话空闲，或带上 `message_id` 等待处理该消息的轮次。 |

这些工具在同一个 DSH 宿主内工作。省略 `project_id` 时使用当前会话的工作目录。显式选择项目后，可与那个项目的独立会话协作。回复用原发送者会话 ID。跨项目时，如果消息带有发送者项目 ID，把它一并传给发送工具。

发消息返回 `queued` 表示已入队。等待返回 `settled` 时，查看 `turn_outcome` 判断该轮是完成、出错还是中断，再从历史读取回复。单次等待默认 30 秒、最多 120 秒，超时后目标会话继续运行。两个会话之间形成等待循环时，后加入的等待会报错。

## 从源码构建

需要 Node.js 22 或更新版本。宿主和浏览器分别加载 `lib/index.js` 与 `lib/client.js`。

```sh
npm ci
npm run build
npm test
npm pack
```

遇到问题时，可在 [GitHub Issues](https://github.com/MindCastlePlayground/dsh-session-workbench/issues) 提交 DSH 版本、profile、复现步骤及去除敏感内容的错误信息。

## 许可与致谢

项目按 [MIT 许可](LICENSE) 发布。会话管理和搜索分别来自 [TOBYCAI/dsh-sessions-manager 3.8.1](https://github.com/TOBYCAI/dsh-sessions-manager/tree/cf9a5bbfe39a95bee7f3bb68c212d774533c356b) 和 [timefarer/dsh-chat-search 1.2.7](https://github.com/timefarer/dsh-chat-search/tree/37c65228f7c8d26f5e212a477d23ba63dd14788f)。

跨会话协作调研参考了 [dsh-cross-session](https://www.npmjs.com/package/%40wha1echai/dsh-cross-session)、[dsh-agent-message](https://github.com/GengDaPeng/dsh-agent-message) 和 [dsh-session-mail](https://github.com/BJ1919810/dsh-session-mail)。工作台直接使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的宿主接口，可独立安装。
