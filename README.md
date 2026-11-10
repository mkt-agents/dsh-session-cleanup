<div align="center">

# dsh-session-cleanup

**DSH 会话清理** — DeepSeek Harness 侧边栏插件：按体积排序会话、归档、删除进可撤销回收站、清理孤立投影缓存。

[![DSH Web Plugin](https://img.shields.io/badge/DSH-Web%20Plugin-0f766e.svg)](https://github.com/mkt-agents/dsh-session-cleanup)
[![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-66%20assertions-238636.svg)](#测试)

[功能](#功能) · [为什么需要](#为什么需要) · [安全模型](#安全模型) · [安装](#安装) · [使用](#使用) · [Host 路由](#host-路由) · [目录结构](#目录结构) · [测试](#测试) · [FAQ](#faq) · [English](#english)

</div>

---

## 功能

- **按体积排序的会话列表** —— 会话按工作区分组，显示字节体积、最后更新时间、运行中/活跃徽章，一眼找出最占空间的会话。
- **归档 / 取消归档** —— 走 `workspaceRegistry.archiveSession`，归档会话从活动列表移出但**一个字节都不动**。
- **可撤销删除** —— 删除会把会话目录**和**它的投影缓存文件一起 **移动** 到 `$DSH_HOME/backups/session-cleanup-<stamp>/`，并写一份 manifest。没有东西被销毁。
- **整批或单条还原** —— 撤销一整个删除动作，也可以只捞回其中某一条会话。
- **显式 purge** —— 唯一真正删除字节的操作，必须按批次或按单条显式请求。
- **清空回收站** —— 一次性丢掉所有 `session-cleanup-*` 批次。
- **孤立缓存清理** —— 删除 `session_projcache/sessions/*.json` 中会话日志已不存在的文件，并报告释放的字节数。
- **失效归档清理** —— 丢掉会话日志已消失的归档/固定（archive/pin）条目。

## 为什么需要

DSH 没有"删除会话"这个能力。移除一个 Workspace 注册项是**故意**保留会话历史的，所以用户想清空间时没有出口：历史日志、投影缓存、失效的归档条目只会越积越多。

这个插件把缺失的那几个操作补上，并且坚持一条原则：**删除必须可逆**。真正不可逆的动作只留一个 `purge`，且必须显式点名。

## 安全模型

| 约束 | 行为 |
|---|---|
| 会话仍被 live Agent 持有 | **跳过**，不移动 —— 它持有日志写入句柄 |
| 移动范围 | 只动 `$DSH_HOME/sessions` 下的内容 |
| 删除范围 | 只动 `$DSH_HOME/backups` 下的内容 |
| 部分失败 | 回滚已移动的条目，并丢弃半成品批次 |
| 跨卷移动 | 回退到 copy-then-remove（`EXDEV`） |
| 跨站写入 | 两条路由都校验 `sec-fetch-site` / `Origin` 对 `Host` |
| 请求体 | 上限 64 KiB；label 截断到 200 字符 |
| 路径穿越 | 批次名必须匹配 `session-cleanup-<stamp>`，相对路径越界即拒绝 |

## 安装

把插件目录放进 DSH profile 的插件目录，或作为 bundle 安装。bundle patch 是 `cordis.patch.yml`：

```yaml
- insert:
    - id: session-cleanup
      name: '@local/dsh-session-cleanup'
      inject: [webServer]
      config: {}
```

`package.json` 把 Client 半边声明为立即注入的 Web client，依赖 `react`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots`。

`DSH_HOME` 默认 `%USERPROFILE%\.dsh`（Windows）/ `$HOME/.dsh`（其他）。

## 使用

1. 打开 Web 界面，左侧栏出现 **会话清理** 入口。
2. 面板按工作区分组列出会话，可按体积 / 更新时间 / 标题排序，支持搜索标题、id、路径。
3. 勾选会话后：
   - **归档** —— 移出活动列表，字节不动。
   - **删除** —— 二次确认后移入回收站，可整批或单条还原。
4. 回收站里 **purge** 才是真删；**清空回收站** 一次清掉所有批次。
5. 顶部两个清理按钮：**清理失效归档**、**清理孤立缓存**（会报告释放字节）。

## Host 路由

仅同源。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/dsh-session-cleanup/state` | workspaces、归档/固定集合、会话、回收站、统计 |
| `POST` | `/dsh-session-cleanup/action` | `archive` \| `unarchive` \| `delete` \| `restore` \| `purge` \| `pruneArchived` \| `pruneOrphanCache` \| `emptyTrash` |

`action` 接受 `{ op, sessionIds?, batch?, labels? }`。`restore` 和 `purge` 必须带 `batch`；`sessionIds` 为空表示作用于整批。**一次删除动作 = 一个回收站批次**，所以批量删除可以作为一个整体撤销。

## 目录结构

```
index.js             Host 半边：路由、回收站批次、孤立缓存扫描（939 行）
client.js            Client 半边：main 面板 + sidebar 入口（1589 行）
cordis.patch.yml     bundle patch
locale/{en,zh}.json  插件元数据字符串
icon.svg             侧边栏图标
test/host.test.mjs   Host 路由测试（28 条断言）
test/client.test.mjs Client 渲染测试（38 条断言）
```

## 测试

```bash
npm test
```

两套测试都跑在纯 Node 上，零依赖：Host 套件用临时 `DSH_HOME` 驱动真实路由处理函数，Client 套件用极简 hook 运行时执行组件树。

```
28/28 passed   host
38/38 passed   client
```

## FAQ

**删除的会话去哪了？**
`$DSH_HOME/backups/session-cleanup-<YYYYMMDD-HHmmss-mmm>/`，同目录下 `manifest.json` 记录批次、会话 id、cwd 分组、标题、体积和删除时间。

**为什么有些会话删不掉？**
它正被 live Agent 持有（已打开或正在运行），日志写入句柄还开着。切到别的会话再删。

**回收站会占空间吗？**
会，而且和原来一样大 —— 这是可撤销的代价。确认无误后 purge 或清空回收站。

**能用在非 Web 端吗？**
不能。Client 半边注册在 `main` 与 `sidebar.panellist` 两个 Web slot 上。

**插件 id 能改吗？**
能。`@local/dsh-session-cleanup` 是本地占位，发布到 npm 时换成你自己的 scope，同时改 `cordis.patch.yml` 里的 `name`。

## English

A DeepSeek Harness (DSH) Web plugin that adds a **session cleanup** panel to the sidebar: list sessions by size, archive them, delete them into an **undoable recycle bin**, and clear orphaned projection cache.

DSH has no session-delete capability (removing a Workspace registration deliberately leaves session histories in place). This plugin owns the missing operations.

- **Size-sorted list** — sessions grouped by workspace with byte size, last-updated time, and a live/running badge.
- **Archive / unarchive** — delegates to `workspaceRegistry.archiveSession`; archived sessions leave the active list without touching bytes.
- **Reversible delete** — the session directory *and* its projection-cache file are **moved** into `$DSH_HOME/backups/session-cleanup-<stamp>/` with a manifest. Nothing is destroyed.
- **Restore per batch or per session** — undo a whole delete action, or bring back a single session of it.
- **Explicit purge** — the only operation that removes bytes, requested per batch or per session.
- **Orphan cache cleanup** — remove `session_projcache/sessions/*.json` whose session log is gone, reporting freed bytes.
- **Stale archive pruning** — drop archive/pin entries whose session log no longer exists.

Safety: a session still attached to a live Agent owns its log writer, so it is skipped rather than moved. Nothing outside `$DSH_HOME/sessions` is ever moved; nothing outside `$DSH_HOME/backups` is ever removed. Moves are rollback-safe, cross-volume moves fall back to copy-then-remove, and both routes reject cross-site writes.

## License

[MIT](LICENSE)
