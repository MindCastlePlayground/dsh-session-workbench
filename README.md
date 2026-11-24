<p align="center">
  <img src="assets/icon.png" width="112" height="112" alt="鲸鱼娘探出双对话框的 DSH 会话工作台图标">
</p>

<h1 align="center">DSH 会话工作台</h1>

<p align="center">管理和搜索 DeepSeek Harness 会话，让 Agent 在项目间分工、通信和移交任务。</p>

<p align="center">
  <a href="https://github.com/MindCastlePlayground/dsh-session-workbench/releases/latest">下载安装包</a> ·
  <a href="#agent-工具">Agent 工具</a> ·
  <a href="#从源码构建">从源码构建</a>
</p>

## 功能

- **项目状态** — 左侧栏的工作区折叠后仍会标记运行中、等待处理和完成未读。子 Agent 的运行状态计入所属项目。
- **会话整理** — 在「设置 → 会话管理」和侧栏菜单中归档、恢复、迁移会话，管理星标、标签和回收站。
- **全文搜索** — 从左侧栏打开全文搜索页，搜索标题、用户消息、助手回复和文件名，默认优先显示正文命中，结果按页浏览，可点中片段回到原文。全局搜索默认是 `Ctrl/Cmd+Alt+Q`，会话内搜索默认是 `Ctrl/Cmd+F`。
- **会话分支** — 在对话原位置查看从该处创建的所有分支，从左侧会话树打开父会话或子会话。
- **项目管理** — Agent 可以创建和重命名项目，在指定项目或默认聊天工作区开会话，并投递初始任务。
- **会话协作** — Agent 可以给其他会话发消息、读取历史、查询运行状态，或等指定消息处理完成。
- **会话迁移** — Agent 可以把会话移到另一项目，保留会话 ID 和消息历史。

## 安装

下载 [`dsh-session-workbench-1.3.1.tgz`](https://github.com/MindCastlePlayground/dsh-session-workbench/releases/download/v1.3.1/dsh-session-workbench-1.3.1.tgz)，进入下载目录并执行与你使用方式对应的一条命令。

```sh
# DSH Desktop
dsh plugin --profile desktop add ./dsh-session-workbench-1.3.1.tgz

# DSH Web
dsh plugin --profile web add ./dsh-session-workbench-1.3.1.tgz
```

安装后刷新页面并确认已出现工作台入口。首次安装时，未启用配置热加载的宿主需要重新启动才能加载插件。如果同一 profile 已启用 `dsh-sessions-manager` 或 `dsh-chat-search`，先停用旧插件以避免路由、菜单或快捷键重复。工作台沿用原有的管理数据和搜索设置目录，无需复制会话文件。

**Web 热切换。** 使用 [DSH Web 0.2.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.3-alpha.2) 和 [会话释放补丁](patches/dsh-session-relocation.patch)。标准宿主可继续移动已关闭的会话；热切换需要宿主支持释放单个会话。搜索索引需要 Node.js 22.13 或更高版本。

从工作台源码目录构建补丁。以下命令把 Web 安装在独立目录，并与桌面版分别运行。Node.js 24.x 请使用 24.22.3 或更新版本。

```sh
npm ci
git clone --branch dsh-v0.2.3-alpha.2 --depth 1 https://github.com/deepseek-ai/deepseek-harness.git ../dsh-web-source
npm install --prefix ../dsh-web @deepseek-ai/dsh@0.2.3-alpha.2
git -C ../dsh-web-source apply "$PWD/patches/dsh-session-relocation.patch"
node patches/apply-web-relocation.mjs ../dsh-web-source ../dsh-web
node ../dsh-web/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add /path/to/dsh-session-workbench-1.3.1.tgz
node ../dsh-web/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web
```

补丁安装脚本将官方模块备份为各自的 `index.js.upstream`。启动新版 Web 后，移动空闲会话时只切换目标会话，其他会话可继续运行。

<details>
<summary>Windows 找不到 <code>dsh</code> 命令</summary>

Windows 默认安装位置可以通过 DSH Desktop 自带的 CLI 安装。Web 用户把下文的 `desktop` 改为 `web`。

```powershell
$dshApp = Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness'
$dshCli = Join-Path $dshApp 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
$previousElectronMode = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = '1'
try {
    & (Join-Path $dshApp 'DeepSeek Harness.exe') --expose-internals $dshCli plugin --profile desktop add ./dsh-session-workbench-1.3.1.tgz | Out-Host
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previousElectronMode
}
```

</details>

## 使用示例

在「设置 → 会话管理」里，点会话的「更多操作 → 移动」，或勾选多条后点「移动所选」。按工作区名称或目录路径搜索，选定目标后确认移动。批量移动如果部分失败，表单会保留失败项和所选目标，可直接重试。移动当场返回结果。其他宿主持有的会话会提示关闭该会话后重试。升级前留下的待移动记录保留手动重试和取消入口。

安装后，从一个独立的 DSH 会话向 Agent 提出任务。

> 创建一个名为「发布核对」的项目，在里面开一个会话核对发布步骤。等那个会话完成后，读它的回复并汇总。最后把那个会话迁移到默认聊天工作区，并告诉我移动结果。

首次打开全文搜索时，工作台在当前 DSH 配置目录创建 SQLite 索引。再次打开时只读取新增和变化的会话。普通聊天时索引保持关闭。回收站或已彻底删除的会话保留最后一次索引的副本；勾选「包含已删除会话」可查询副本。已经建索引的内容仍保存在本机搜索数据库中。

默认搜索最近 14 天和每个会话最近 30 轮。清空日期、把轮次设为 0 可查全量历史。结果显示正文片段、命中数量和分页入口。

## Agent 工具

### 项目与会话

| 工具 | 参数与行为 |
| --- | --- |
| `workbench_project_list` | 列出项目 ID、名称和目录，并返回当前项目与默认聊天工作区。 |
| `workbench_project_create` | 传入 `name`。可用 `path` 指定宿主上的绝对路径，省略时从 DSH 数据目录分配独立目录。 |
| `workbench_project_rename` | 传入 `project_id` 和新 `name`。保留目录和会话。 |
| `workbench_session_create` | 传入 `project_id`。可用 `title` 命名，或用 `message` 投递初始任务。 |
| `workbench_session_move` | 传入 `session_id` 和 `target_project_id`。原会话位于其他项目时，带上 `source_project_id`。宿主支持关闭单个会话时，可用 `stop_running: true` 停止目标会话并立即移动。 |
| `workbench_session_move_status` | 传入 `session_id` 和目标 `project_id`，查询是否已经到达目标项目，或是否仍有旧版待移动记录。 |

创建或迁移会话时，可用 `default` 选择默认聊天工作区。旧配置没有 DSH 原生默认工作区时，首次使用会创建专用的「默认聊天」工作区。

迁移保留会话 ID 和历史，同时更新工作目录。Web 中打开的空闲会话也可以直接切换。运行中的目标会话会返回运行状态，由用户决定是否停止该会话。仍由其他宿主持有的会话需要先在原宿主关闭。

Agent 可以把当前会话移入选定项目。工作区写入模式通过 DSH 原生审批确认目标目录，允许后工具返回 `switching_after_turn`。当轮结果保存后立即切换，并可用 `workbench_session_move_status` 查看结果。

### 搜索与会话管理

| 工具 | 用途 |
| --- | --- |
| `workbench_session_search` | 按范围和日期查询全文，返回片段、分页位置、索引版本。可用 `include_deleted` 包含删除快照。 |
| `workbench_search_index_status`、`workbench_search_index_update` | 查询索引状态或主动进行增量同步。 |
| `workbench_manager_*` | 查询会话和分支、批量移动和归档、标星、处理标签及保存筛选、管理回收站、导出 Markdown。归档、删除和批量移动等操作通过原生审批。 |

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

项目状态标记改编自 [Stijnus/dsh-workspace-status 0.3.2](https://github.com/Stijnus/dsh-workspace-status/tree/c3ca1a0fc99a4b315c7911703f0ba970038ea312)，保留[上游 MIT 许可](src/workspace-status/LICENSE)。

项目按 [MIT 许可](LICENSE) 发布。会话管理和搜索分别来自 [TOBYCAI/dsh-sessions-manager 3.8.1](https://github.com/TOBYCAI/dsh-sessions-manager/tree/cf9a5bbfe39a95bee7f3bb68c212d774533c356b) 和 [timefarer/dsh-chat-search 1.2.7](https://github.com/timefarer/dsh-chat-search/tree/37c65228f7c8d26f5e212a477d23ba63dd14788f)。

跨会话协作调研参考了 [dsh-cross-session](https://www.npmjs.com/package/%40wha1echai/dsh-cross-session)、[dsh-agent-message](https://github.com/GengDaPeng/dsh-agent-message) 和 [dsh-session-mail](https://github.com/BJ1919810/dsh-session-mail)。工作台直接使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的宿主接口，可独立安装。
