window.__ModuleLoader__.load({
  id: '@local/dsh-session-cleanup',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'session-cleanup'
    const PANEL_ID = 'session-cleanup'
    const STATE_PATH = 'dsh-session-cleanup/state'
    const ACTION_PATH = 'dsh-session-cleanup/action'
    const PREVIEW_PATH = 'dsh-session-cleanup/preview'
    /** Icon key this plugin owns in the shared `contextMenu.icon` registry. */
    const MENU_ICON_KEY = 'session-cleanup.delete'
    /** Bounded lookup retries while another plugin's boot provides the menu service. */
    const MAX_MENU_ATTEMPTS = 20

    const EN = {
      'panel.title': 'Session cleanup',
      'panel.subtitle': 'Find heavy sessions, archive them, or delete them into a recycle bin you can undo.',
      'panel.refresh': 'Refresh',
      'panel.loading': 'Loading sessions…',
      'panel.error': 'Could not read sessions: {message}',
      'panel.retry': 'Retry',
      'panel.empty': 'No sessions.',
      'panel.emptyFilter': 'No session matches “{query}”.',
      'panel.section.active': 'Sessions',
      'panel.section.archived': 'Archived',
      'panel.ungrouped': 'Ungrouped',
      'panel.ungroupedPath': 'not assigned to a workspace',
      'panel.workspaceCount': '{count} sessions',
      'panel.unknownSession': 'Untitled session',
      'panel.updatedAt': 'updated {time}',
      'panel.search': 'Search title, id, or path',
      'panel.sort.updated': 'Newest first',
      'panel.sort.size': 'Largest first',
      'panel.sort.title': 'Title A→Z',
      'panel.action.archive': 'Archive',
      'panel.action.unarchive': 'Restore',
      'panel.action.delete': 'Delete',
      'panel.action.confirmDelete': 'Confirm delete',
      'panel.action.cancel': 'Cancel',
      'panel.action.selectAll': 'Select all',
      'panel.action.clear': 'Clear',
      'panel.action.collapse': 'Collapse group',
      'panel.action.expand': 'Expand group',
      'panel.badge.running': 'running',
      'panel.badge.live': 'open',
      'panel.badge.blank': 'empty',
      'panel.badge.pinned': 'pinned',
      'panel.badge.subagent': 'subagent',
      'panel.hint.live': 'Open or running sessions cannot be deleted. Switch away from them first.',
      'panel.bulk.selected': '{count} selected',
      'panel.bulk.size': '{size} total',
      'panel.bulk.archive': 'Archive selected',
      'panel.bulk.unarchive': 'Restore selected',
      'panel.bulk.delete': 'Delete selected',
      'panel.bulk.confirm': 'Move {count} session(s) to the recycle bin?',
      'panel.bulk.skipLive': '{count} open session(s) were skipped.',
      'panel.bulk.running': 'Working…',
      'panel.notice.ok': 'Done: {ok} changed, {failed} failed.',
      'panel.notice.deleted': 'Moved {count} session(s) to the recycle bin. You can undo below.',
      'panel.notice.firstError': 'First failure: {message}',
      'panel.notice.empty': 'Nothing selected.',
      'panel.stats.sessions': '{count} sessions · {size}',
      'panel.stats.trash': 'Recycle bin: {count} · {size}',
      'panel.stats.orphans': 'Orphan cache: {count} · {size}',
      'panel.trash.title': 'Recycle bin',
      'panel.trash.subtitle': 'Deleted sessions stay here until you purge them.',
      'panel.trash.batch': '{count} session(s) · {size} · {time}',
      'panel.trash.batchMeta': '{count} session(s) · {size}',
      'panel.trash.restore': 'Restore',
      'panel.trash.purge': 'Purge',
      'panel.trash.restoreAll': 'Restore batch',
      'panel.trash.purgeAll': 'Purge batch',
      'panel.trash.confirmPurge': 'Purge this for good?',
      'panel.trash.confirmPurgeBatch': 'Purge all {count} session(s) in this batch?',
      'panel.trash.restoreSelected': 'Restore selected',
      'panel.trash.purgeSelected': 'Permanently delete selected',
      'panel.trash.confirmPurgeSelected': 'Permanently delete {count} selected session(s)? This cannot be undone.',
      'panel.trash.selectBatch': 'Select all in this batch',
      'panel.trash.batchChecked': '{selected}/{count} selected',
      'panel.trash.restored': 'Restored {count} session(s).',
      'panel.trash.purged': 'Purged {count} item(s).',
      'panel.trash.empty': 'The recycle bin is empty.',
      'panel.trash.emptyAll': 'Empty recycle bin',
      'panel.trash.confirmEmpty': 'Purge every batch in the recycle bin?',
      'panel.trash.itemFallback': 'Untitled session',
      'panel.orphan.title': 'Archived entries with no stored log',
      'panel.orphan.body':
        '{count} archived id(s) no longer have a session log on disk, so they cannot be shown or restored. Clean them out of the archive list?',
      'panel.orphan.action': 'Clean up {count}',
      'panel.orphan.done': 'Removed {count} stale archive entry/entries.',
      'panel.cache.title': 'Orphan projection cache',
      'panel.cache.body':
        '{count} cached projection file(s) ({size}) belong to sessions that no longer exist. Deleting them frees disk space without touching any live session.',
      'panel.cache.action': 'Delete {count} file(s)',
      'panel.cache.done': 'Removed {count} file(s), freed {size}.',
      'panel.cache.unavailable': 'Session storage is unavailable, so orphan detection is disabled.',
      'panel.nav.workspaces': 'Workspaces',
      'panel.nav.maintain': 'Maintenance',
      'panel.nav.emptyCache': 'No orphaned cache files.',
      'panel.nav.emptyArchived': 'No archived sessions.',
      'panel.emptyHint': 'Pick another view on the left, or clear the search above.',
      'menu.delete': 'Delete session',
      'menu.deleted': 'Moved to the recycle bin.',
      'menu.inUse': 'This session is open or running. Switch to another session and retry.',
      'menu.missing': 'This session has no stored log any more.',
      'menu.failed': 'Delete failed: {message}',
      'panel.preview.back': 'Back',
      'panel.preview.loading': 'Reading the log…',
      'panel.preview.empty': 'This session has no readable messages yet.',
      'panel.preview.truncated': 'Showing the last {count} messages.',
      'panel.preview.records': '{count} turns · {size}',
      'panel.preview.user': 'You',
      'panel.preview.assistant': 'Assistant',
      'panel.preview.error': 'Could not read the log: {message}',
      'panel.action.confirmCache': 'Confirm cleanup',
      'panel.cache.confirm': 'Delete {count} orphaned cache file(s)? This cannot be undone.',
      'panel.bulk.hiddenFilter': '{count} selected item(s) are hidden by the current filter.',
      'panel.notice.summary': 'Done: {ok} changed, {failed} failed, {skipped} skipped.',
      'panel.notice.firstSkip': 'Skipped: {message}',
      'panel.trash.emptied': 'Purged {count} session(s) in {batches} batch(es).',
      'panel.sort.label': 'Sort sessions',
    }

    const ZH = {
      'panel.title': '会话清理',
      'panel.subtitle': '按体积找出占用大的会话，归档或删除到可还原的回收站。',
      'panel.refresh': '刷新',
      'panel.loading': '正在读取会话…',
      'panel.error': '读取会话失败：{message}',
      'panel.retry': '重试',
      'panel.empty': '没有会话。',
      'panel.emptyFilter': '没有匹配“{query}”的会话。',
      'panel.section.active': '会话',
      'panel.section.archived': '已归档',
      'panel.ungrouped': '未分组',
      'panel.ungroupedPath': '未归属任何工作区',
      'panel.workspaceCount': '{count} 个会话',
      'panel.unknownSession': '未命名会话',
      'panel.updatedAt': '更新于 {time}',
      'panel.search': '搜索标题、ID 或路径',
      'panel.sort.updated': '最近更新',
      'panel.sort.size': '体积最大',
      'panel.sort.title': '标题 A→Z',
      'panel.action.archive': '归档',
      'panel.action.unarchive': '恢复',
      'panel.action.delete': '删除',
      'panel.action.confirmDelete': '确认删除',
      'panel.action.cancel': '取消',
      'panel.action.selectAll': '全选',
      'panel.action.clear': '清空选择',
      'panel.action.collapse': '收起分组',
      'panel.action.expand': '展开分组',
      'panel.badge.running': '运行中',
      'panel.badge.live': '已打开',
      'panel.badge.blank': '空白',
      'panel.badge.pinned': '已置顶',
      'panel.badge.subagent': '子会话',
      'panel.hint.live': '已打开或运行中的会话不能删除，请先切换到其他会话。',
      'panel.bulk.selected': '已选 {count} 项',
      'panel.bulk.size': '共 {size}',
      'panel.bulk.archive': '归档所选',
      'panel.bulk.unarchive': '恢复所选',
      'panel.bulk.delete': '删除所选',
      'panel.bulk.confirm': '确定把 {count} 个会话移入回收站？',
      'panel.bulk.skipLive': '已跳过 {count} 个已打开会话。',
      'panel.bulk.running': '处理中…',
      'panel.notice.ok': '完成：成功 {ok} 个，失败 {failed} 个。',
      'panel.notice.deleted': '已把 {count} 个会话移入回收站，可在下方还原。',
      'panel.notice.firstError': '首个失败原因：{message}',
      'panel.notice.empty': '没有选中任何会话。',
      'panel.stats.sessions': '{count} 个会话 · {size}',
      'panel.stats.trash': '回收站：{count} 个 · {size}',
      'panel.stats.orphans': '孤立缓存：{count} 个 · {size}',
      'panel.trash.title': '回收站',
      'panel.trash.subtitle': '删除的会话先放在这里，直到你彻底清除。',
      'panel.trash.batch': '{count} 个会话 · {size} · {time}',
      'panel.trash.batchMeta': '{count} 个会话 · {size}',
      'panel.trash.restore': '还原',
      'panel.trash.purge': '清除',
      'panel.trash.restoreAll': '整批还原',
      'panel.trash.purgeAll': '整批清除',
      'panel.trash.confirmPurge': '确定彻底清除这一项？',
      'panel.trash.confirmPurgeBatch': '确定彻底清除该批次的 {count} 个会话？',
      'panel.trash.restoreSelected': '还原所选',
      'panel.trash.purgeSelected': '永久删除所选',
      'panel.trash.confirmPurgeSelected': '确定永久删除所选的 {count} 个会话？此操作无法恢复。',
      'panel.trash.selectBatch': '全选该批次',
      'panel.trash.batchChecked': '已选 {selected}/{count}',
      'panel.trash.restored': '已还原 {count} 个会话。',
      'panel.trash.purged': '已清除 {count} 项。',
      'panel.trash.empty': '回收站是空的。',
      'panel.trash.emptyAll': '清空回收站',
      'panel.trash.confirmEmpty': '确定清空回收站里的全部批次？',
      'panel.trash.itemFallback': '未命名会话',
      'panel.orphan.title': '已归档但日志已不存在的条目',
      'panel.orphan.body':
        '有 {count} 条归档记录的会话日志在磁盘上已不存在，既无法显示也无法还原。要把它们从归档列表里清理掉吗？',
      'panel.orphan.action': '清理这 {count} 条',
      'panel.orphan.done': '已移除 {count} 条失效的归档记录。',
      'panel.cache.title': '孤立投影缓存',
      'panel.cache.body':
        '有 {count} 个投影缓存文件（{size}）属于已经不存在的会话。删除它们可以释放磁盘空间，不会影响任何现存会话。',
      'panel.cache.action': '删除这 {count} 个文件',
      'panel.cache.done': '已删除 {count} 个文件，释放 {size}。',
      'panel.cache.unavailable': '会话存储不可用，已停用孤立缓存检测。',
      'panel.nav.workspaces': '工作区',
      'panel.nav.maintain': '维护',
      'panel.nav.emptyCache': '没有孤立缓存。',
      'panel.nav.emptyArchived': '没有已归档会话。',
      'panel.emptyHint': '试试在左侧切换视图，或清理搜索条件。',
      'menu.delete': '删除会话',
      'menu.deleted': '已移入回收站。',
      'menu.inUse': '这个会话正在使用中（已打开或运行），请先切换到其他会话再删除。',
      'menu.missing': '这个会话的日志已经不存在了。',
      'menu.failed': '删除失败：{message}',
      'panel.preview.back': '返回',
      'panel.preview.loading': '正在读取会话记录…',
      'panel.preview.empty': '这个会话还没有可预览的消息。',
      'panel.preview.truncated': '只显示最近 {count} 条消息。',
      'panel.preview.records': '{count} 轮对话 · {size}',
      'panel.preview.user': '你',
      'panel.preview.assistant': '助手',
      'panel.preview.error': '读取会话记录失败：{message}',
      'panel.action.confirmCache': '确认清理',
      'panel.cache.confirm': '确定删除 {count} 个孤立缓存文件？此操作无法撤销。',
      'panel.bulk.hiddenFilter': '另有 {count} 项已选，但不在当前筛选结果中。',
      'panel.notice.summary': '完成：成功 {ok} 个，失败 {failed} 个，跳过 {skipped} 个。',
      'panel.notice.firstSkip': '跳过原因：{message}',
      'panel.trash.emptied': '已清除 {count} 个会话（{batches} 个批次）。',
      'panel.sort.label': '排序',
    }

    // Surface tokens: the host's own management-list contract is a fill plus a
    // stroke (--dsw-alias-settings-card-*), and a raised band for headers.
    // bg-layer-1/2 alone cannot express this: in the light palette they are the
    // same pure white as the page, so a card painted with them has no visible
    // boundary at all. Every surface therefore pairs a fill with a stroke.
    const CSS = [
      '.dshsc-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;--dshsc-row-selected-bg:var(--dsw-alias-bg-multi-select);--dshsc-row-selected-bar:var(--dsw-alias-state-business-primary);}',
      '.dshsc-head{display:flex;flex-direction:column;gap:6px;padding:12px 20px 8px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dshsc-headRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
      '.dshsc-h1{margin:0;font-size:17px;font-weight:600;line-height:26px;letter-spacing:-.01em;}',
      '.dshsc-metaRow{display:flex;align-items:center;gap:6px 12px;min-width:0;flex-wrap:wrap;}',
      '.dshsc-sub{margin:0;flex:1 1 200px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dshsc-spacer{flex:1;}',
      '.dshsc-toolbar{display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap;}',
      '.dshsc-toolbarLabel{display:inline-flex;align-items:center;gap:6px;padding-left:2px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none;}',
      '.dshsc-search{flex:1;min-width:160px;max-width:460px;height:30px;padding:0 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;}',
      '.dshsc-search:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.dshsc-select{height:30px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;}',
      '.dshsc-stats{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;}',
      '.dshsc-stat{padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);white-space:nowrap;font-variant-numeric:tabular-nums;}',
      '.dshsc-statWarn{color:var(--dsw-alias-state-warn-label);}',
      '.dshsc-split{display:flex;flex:1;min-height:0;}',
      '.dshsc-nav{flex:none;width:220px;min-width:0;display:flex;flex-direction:column;gap:2px;padding:8px 8px 16px;overflow:auto;border-right:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);}',
      '.dshsc-navSection{padding:8px 8px 4px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-navItem{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;text-align:left;cursor:pointer;transition:background .12s;}',
      '.dshsc-navItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}',
      '.dshsc-navItem:disabled{opacity:.5;cursor:not-allowed;}',
      '.dshsc-navItem:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.dshsc-navItemActive,.dshsc-navItemActive:hover:not(:disabled){background:var(--dshsc-row-selected-bg);box-shadow:inset 2px 0 0 var(--dshsc-row-selected-bar);}',
      '.dshsc-navMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}',
      '.dshsc-navLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;}',
      '.dshsc-navMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      '.dshsc-navWarn .dshsc-navMeta,.dshsc-navWarn .dshsc-pill{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary);}',
      '.dshsc-navDivider{height:1px;margin:6px 8px;background:var(--dsw-alias-border-l2);}',
      '.dshsc-pane{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;}',
      '.dshsc-paneHead{flex:none;display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dshsc-paneBody{flex:1;min-height:0;overflow:auto;padding:10px 16px 20px;}',
      '.dshsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s;}',
      '.dshsc-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover);}',
      '.dshsc-btn:disabled{opacity:.4;cursor:not-allowed;}',
      '.dshsc-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.dshsc-btnSm{height:28px;padding:0 10px;font-size:12px;border-radius:6px;}',
      '.dshsc-btnGhost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);}',
      '.dshsc-btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:transparent;color:var(--dsw-alias-label-primary);}',
      '.dshsc-btnDanger{color:var(--dsw-alias-state-error-primary);}',
      '.dshsc-btnDanger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger);}',
      '.dshsc-btnSolidDanger{color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);font-weight:600;}',
      '.dshsc-btnSolidDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-secondary);border-color:var(--dsw-alias-state-error-secondary);}',
      '.dshsc-card{margin:0 0 8px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:10px;background:var(--dsw-alias-bg-base);overflow:hidden;}',
      '.dshsc-cardLoose{border-style:dashed;}',
      '.dshsc-cardHead{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 10px 0 6px;background:var(--dsw-alias-bg-module-platform);border-bottom:1px solid var(--dsw-alias-settings-card-stroke);}',
      '.dshsc-cardHeadEmpty{border-bottom:none;}',
      '.dshsc-chevron{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:5px;padding:0;transition:background .12s,color .12s;}',
      '.dshsc-chevron:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.dshsc-cardTitle{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:34%;}',
      '.dshsc-headStats{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;white-space:nowrap;}',
      '.dshsc-headSize{color:var(--dsw-alias-label-secondary);font-weight:500;font-variant-numeric:tabular-nums;}',
      '.dshsc-pill{flex:none;min-width:20px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;text-align:center;border:1px solid var(--dsw-alias-border-l3);font-variant-numeric:tabular-nums;}',
      '.dshsc-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2);transition:background .12s,box-shadow .12s;}',
      '.dshsc-rowFirst{border-top:none;}',
      '.dshsc-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dshsc-rowSelected{background:var(--dshsc-row-selected-bg);box-shadow:inset 2px 0 0 var(--dshsc-row-selected-bar);}',
      '.dshsc-rowSelected:hover{background:var(--dshsc-row-selected-bg);}',
      '.dshsc-rowNested{padding-left:30px;}',
      '.dshsc-check{flex:none;width:18px;height:18px;margin:0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;}',
      '.dshsc-check:disabled{cursor:not-allowed;opacity:.45;}',
      '.dshsc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;}',
      '.dshsc-mainStatic{cursor:default;}',
      '.dshsc-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;}',
      '.dshsc-titleMuted{color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;overflow:hidden;white-space:nowrap;}',
      '.dshsc-size{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dshsc-sizeCell{flex:none;width:64px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dshsc-sizeBig{color:var(--dsw-alias-state-warn-label);font-weight:600;}',
      '.dshsc-badge{padding:0 6px;border-radius:4px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;}',
      '.dshsc-badgeLive{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);}',
      '.dshsc-badgeRun{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary);}',
      '.dshsc-actions{display:flex;align-items:center;gap:4px;flex:none;}',
      '.dshsc-notice{display:flex;align-items:center;gap:10px;margin:0 20px 10px;padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:17px;}',
      '.dshsc-noticeError{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.dshsc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:64px 16px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;}',
      '.dshsc-paneBody > .dshsc-empty{min-height:62%;}',
      '.dshsc-emptyIcon{display:inline-flex;color:var(--dsw-alias-label-tertiary);opacity:.75;}',
      '.dshsc-emptyTitle{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);}',
      '.dshsc-emptyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-skeleton{display:flex;align-items:center;justify-content:center;min-height:140px;color:var(--dsw-alias-label-tertiary);font-size:12px;}',
      '.dshsc-dock{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-bg-module-platform);}',
      '.dshsc-dockInfo{font-size:12px;font-weight:600;}',
      '.dshsc-dockHint{font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-confirmText{font-size:12px;color:var(--dsw-alias-state-error-primary);font-weight:500;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dshsc-preview{display:flex;flex-direction:column;gap:12px;min-height:0;}',
      '.dshsc-previewHead{position:sticky;top:-10px;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-10px -16px 0;padding:10px 16px 8px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dshsc-previewTitle{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%;}',
      '.dshsc-previewMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.dshsc-previewChip{padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;}',
      '.dshsc-transcript{display:flex;flex-direction:column;gap:14px;max-width:900px;padding:4px 0 12px;}',
      '.dshsc-msg{display:flex;flex-direction:column;gap:5px;min-width:0;}',
      '.dshsc-roleChip{align-self:flex-start;padding:0 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;}',
      '.dshsc-roleChipUser{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-multi-select);border-color:transparent;}',
      '.dshsc-msgText{min-width:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:21px;color:var(--dsw-alias-label-primary);}',
      '.dshsc-msgUser .dshsc-msgText{align-self:flex-start;max-width:82%;padding:10px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);}',
      '.dshsc-msgAssistant .dshsc-msgText{padding:0 2px;}',
      '.dshsc-previewFoot{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;padding-top:10px;border-top:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;}',
      '.dshsc-navSectionGap{padding-top:14px;}',
      '.dshsc-navIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-navItemActive .dshsc-navIcon{color:var(--dsw-alias-state-business-primary);}',
      '.dshsc-navWarn .dshsc-navIcon{color:var(--dsw-alias-state-warn-label);}',
      '.dshsc-navZero .dshsc-navLabel{color:var(--dsw-alias-label-tertiary);}',
      '.dshsc-navZero .dshsc-pill{opacity:.55;}',
      '.dshsc-dockFoot{border-bottom:none;border-top:1px solid var(--dsw-alias-settings-card-stroke);margin-top:auto;}',
      '@media (max-width:760px){',
      '.dshsc-split{flex-direction:column;}',
      '.dshsc-nav{width:100%;flex-direction:row;flex-wrap:wrap;gap:6px;padding:8px 12px;overflow:auto;border-right:none;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:none;}',
      '.dshsc-navSection,.dshsc-navDivider{display:none;}',
      '.dshsc-navItem{width:auto;padding:8px 12px;border-radius:999px;border-color:var(--dsw-alias-border-l3);}',
      '.dshsc-navItemActive{border-color:var(--dsw-alias-state-business-primary);box-shadow:none;}',
      '.dshsc-navMeta{display:none;}',
      '.dshsc-paneHead,.dshsc-dock{padding:8px 12px;}',
      '.dshsc-paneBody{padding:10px 12px 16px;}',
      '.dshsc-previewHead{align-items:flex-start;}',
      '}',
    ].join('')

    /**
     * Resolve a route path against the document's base directory, so the panel
     * keeps working behind a reverse proxy that mounts DSH under a prefix.
     * @param path - Route path without a leading slash.
     * @returns the request path.
     */
    function apiPath(path) {
      if (typeof document === 'undefined') return '/' + path
      try {
        const url = new URL(path, document.baseURI)
        return url.pathname + url.search
      } catch {
        return '/' + path
      }
    }

    /**
     * Perform one JSON request against the plugin's Host routes.
     * @param path - Route path without a leading slash.
     * @param init - Fetch options.
     * @returns the parsed payload.
     */
    async function request(path, init) {
      const response = await fetch(apiPath(path), { cache: 'no-store', ...(init ?? {}) })
      const text = await response.text()
      let data
      try {
        data = text === '' ? undefined : JSON.parse(text)
      } catch {
        data = undefined
      }
      if (!response.ok) throw new Error((data && data.error) || 'HTTP ' + response.status)
      return data
    }

    /**
     * Post one action to the Host.
     * @param body - Action payload.
     * @returns the Host response.
     */
    function act(body) {
      return request(ACTION_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    /**
     * Delete one Session from the sidebar's own context menu, in one click.
     *
     * No second-click arm step: the delete is reversible (the Session lands in
     * the recycle bin batch set, not unlinked), so the menu row deletes directly
     * and reports the outcome through the menu service's notify channel.
     * @param ctx - Client plugin context.
     * @param t - Bound translator for this plugin's namespace.
     * @param sessionId - Session the menu was opened for.
     * @param displayTitle - Title captured by the menu row, stored in the batch.
     */
    async function deleteFromMenu(ctx, t, sessionId, displayTitle) {
      const menus = ctx.get('contextMenus')
      const title = typeof displayTitle === 'string' && displayTitle !== '' ? displayTitle : undefined
      try {
        const result = await act({
          op: 'delete',
          sessionIds: [sessionId],
          ...(title === undefined ? {} : { labels: { [sessionId]: title } }),
        })
        const outcome = result?.results?.[0] ?? {}
        if (outcome.ok !== true) {
          const code = String(outcome.error ?? '')
          const text =
            code === 'session-in-use'
              ? t('menu.inUse')
              : code === 'session-log-not-found'
                ? t('menu.missing')
                : t('menu.failed', { message: outcome.reason ?? code ?? 'unknown' })
          menus?.notify?.(text)
          return
        }
        menus?.notify?.(t('menu.deleted'), true)
        // The Host Session list is a projection: drop the stale row immediately so
        // the sidebar reflects the move without waiting for a reload.
        try {
          await ctx.get('sessions')?.refresh?.()
        } catch {}
      } catch (cause) {
        menus?.notify?.(t('menu.failed', { message: cause instanceof Error ? cause.message : String(cause) }))
      }
    }

    /**
     * Format one timestamp for the row meta line.
     * @param value - Milliseconds since the epoch.
     * @returns the display text, or an empty string when unknown.
     */
    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      try {
        return date.toLocaleString(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return date.toISOString().slice(0, 16).replace('T', ' ')
      }
    }

    /**
     * Format a byte count with a compact unit.
     * @param value - Bytes.
     * @returns the display text, or an empty string for a non-positive value.
     */
    function formatBytes(value) {
      const bytes = Number(value)
      if (!Number.isFinite(bytes) || bytes <= 0) return ''
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let size = bytes
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      const digits = unit === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2
      return size.toFixed(digits) + ' ' + units[unit]
    }

    /**
     * Shorten a session id for an unnamed row.
     * @param id - Session identity.
     * @returns a compact label.
     */
    function shortId(id) {
      const text = String(id)
      const trimmed = text.startsWith('session-') ? text.slice('session-'.length) : text
      return trimmed.slice(0, 8)
    }

    /**
     * The last path segment of a session cwd.
     * @param cwd - Absolute directory.
     * @returns the folder name, or an empty string.
     */
    function baseName(cwd) {
      if (typeof cwd !== 'string' || cwd === '') return ''
      const parts = cwd.split(/[\\/]+/).filter((part) => part !== '')
      return parts.length === 0 ? cwd : parts[parts.length - 1]
    }

    /** The trash-can glyph shown in the sidebar rail. */
    function CleanupIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 18
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('path', { d: 'M3 4.2h10' }),
        h('path', { d: 'M6.2 4.2V3.1a.9.9 0 0 1 .9-.9h1.8a.9.9 0 0 1 .9.9v1.1' }),
        h('path', { d: 'M4.4 4.2l.5 8.3a1.6 1.6 0 0 0 1.6 1.5h3a1.6 1.6 0 0 0 1.6-1.5l.5-8.3' }),
        h('path', { d: 'M6.6 6.6v4.3M9.4 6.6v4.3' }),
      )
    }

    /**
     * The same glyph at menu scale, registered under this plugin's icon key.
     * `contextMenu.icon` passes the action's icon descriptor; this glyph has no
     * use for it, so the prop is accepted and ignored.
     * @returns the menu-sized trash glyph.
     */
    function MenuTrashIcon() {
      return h(CleanupIcon, { size: 16 })
    }

    /** A chevron that points down when expanded and right when collapsed. */
    function Chevron({ open }) {      return h(
        'svg',
        {
          width: 12,
          height: 12,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' },
          'aria-hidden': true,
        },
        h('path', { d: 'M6 3.5L10.5 8L6 12.5' }),
      )
    }

    /** Stroke-glyph path table shared by the rail, the toolbar and empty states. */
    const GLYPHS = {
      archive: 'M2.5 3.5h11M2.5 3.5v2.5h11V3.5M4 6v6.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6M6.5 8.5h3',
      trash:
        'M3 4.5h10M5.5 4.5V3a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8M6.7 7v4M9.3 7v4',
      cache: 'M8 2l5.5 3L8 8 2.5 5 8 2M2.5 8.5L8 11.5l5.5-3M2.5 11.5L8 14.5l5.5-3',
      inbox:
        'M2.5 8.5V12a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V8.5M2.5 8.5L4.6 3.2a1 1 0 0 1 .9-.7h5a1 1 0 0 1 .9.7l2.1 5.3M2.5 8.5h3.2a.8.8 0 0 1 .8.9 1.6 1.6 0 0 0 3 0 .8.8 0 0 1 .8-.9h3.2',
      refresh: 'M13 8a5 5 0 1 1-1.4-3.5M13.5 2.5V5H11',
    }

    /**
     * One small stroke glyph by name from {@link GLYPHS}.
     * @param props - name and optional size/strokeWidth.
     * @returns the svg element.
     */
    function Glyph({ name, size, strokeWidth }) {
      const edge = typeof size === 'number' && size > 0 ? size : 14
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: strokeWidth ?? 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: GLYPHS[name] ?? '' }),
      )
    }

    /**
     * Centered empty state: one glyph, the reason, and an optional way out.
     * @param props - icon name, title text, optional hint text.
     * @returns the empty block.
     */
    function EmptyState({ icon, title, hint }) {
      return h(
        'div',
        { className: 'dshsc-empty' },
        h('span', { className: 'dshsc-emptyIcon' }, h(Glyph, { name: icon ?? 'inbox', size: 28, strokeWidth: 1.1 })),
        h('div', { className: 'dshsc-emptyTitle' }, title),
        hint === undefined || hint === '' ? null : h('div', { className: 'dshsc-emptyHint' }, hint),
      )
    }

    /**
     * A tri-state checkbox: checked when every id is selected, indeterminate on
     * a partial selection.
     * @param props - checked/indeterminate/disabled and the change handler.
     * @returns the input element.
     */
    function TriCheck({ checked, indeterminate, disabled, label, onChange }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (ref.current !== null) ref.current.indeterminate = indeterminate === true
      }, [indeterminate])
      return h('input', {
        ref,
        type: 'checkbox',
        className: 'dshsc-check',
        checked,
        disabled,
        'aria-label': label,
        'aria-checked': indeterminate === true ? 'mixed' : checked === true ? 'true' : 'false',
        'data-indeterminate': indeterminate === true ? 'true' : 'false',
        onChange,
      })
    }

    /**
     * One entry in the left navigation rail.
     * @param props - label, optional meta line, optional leading glyph, count,
     *   and active/warn/muted state.
     * @returns the nav button element.
     */
    function NavItem({ label, meta, count, title, active, warn, muted, icon, disabled, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-current': active === true,
          'aria-selected': active === true,
          className:
            'dshsc-navItem' +
            (active === true ? ' dshsc-navItemActive' : '') +
            (warn === true ? ' dshsc-navWarn' : '') +
            (muted === true ? ' dshsc-navZero' : ''),
          title: title ?? label,
          disabled,
          onClick,
        },
        icon === undefined ? null : h('span', { className: 'dshsc-navIcon' }, h(Glyph, { name: icon })),
        h(
          'span',
          { className: 'dshsc-navMain' },
          h('span', { className: 'dshsc-navLabel' }, label),
          meta === undefined || meta === '' ? null : h('span', { className: 'dshsc-navMeta' }, meta),
        ),
        h('span', { className: 'dshsc-pill' }, String(count ?? 0)),
      )
    }

    /**
     * One row's inline actions, including the two-step delete confirmation.
     * @param props - Row actions.
     * @returns the action element.
     */
    function RowActions({ row, archived, pending, confirming, onArchive, onUnarchive, onDelete, onConfirm, onCancel, t }) {
      const busy = pending
      const canDelete = !row.live
      return h(
        'div',
        { className: 'dshsc-actions' },
        archived
          ? h(
              'button',
              { type: 'button', className: 'dshsc-btn dshsc-btnSm dshsc-btnGhost', disabled: busy, onClick: () => onUnarchive(row.id) },
              t('panel.action.unarchive'),
            )
          : h(
              'button',
              { type: 'button', className: 'dshsc-btn dshsc-btnSm dshsc-btnGhost', disabled: busy, onClick: () => onArchive(row.id) },
              t('panel.action.archive'),
            ),
        confirming
          ? [
              h(
                'button',
                {
                  key: 'confirm',
                  type: 'button',
                  className: 'dshsc-btn dshsc-btnSm dshsc-btnSolidDanger',
                  disabled: busy,
                  onClick: () => onConfirm(row.id),
                },
                t('panel.action.confirmDelete'),
              ),
              h(
                'button',
                { key: 'cancel', type: 'button', className: 'dshsc-btn dshsc-btnSm', disabled: busy, onClick: onCancel },
                t('panel.action.cancel'),
              ),
            ]
          : h(
              'button',
              {
                type: 'button',
                className: 'dshsc-btn dshsc-btnSm dshsc-btnGhost dshsc-btnDanger',
                disabled: busy || !canDelete,
                title: canDelete ? undefined : t('panel.hint.live'),
                onClick: () => onDelete(row.id),
              },
              t('panel.action.delete'),
            ),
      )
    }

    /**
     * One workspace group rendered as a bordered card with a slim stats header and
     * collapsible rows. The rail already names the group, so the header carries
     * only what the list cannot: its size and length. Selection lives in the pane
     * toolbar, never a second select-all.
     * @param props - Group data and handlers.
     * @returns the card element.
     */
    function GroupCard({
      group,
      selection,
      pending,
      confirming,
      collapsed,
      onToggleCollapse,
      onToggleRow,
      onPreview,
      onArchive,
      onUnarchive,
      onDelete,
      onConfirm,
      onCancel,
      t,
    }) {
      const ids = group.rows.map((row) => row.id)
      const headClass = 'dshsc-cardHead' + (collapsed ? ' dshsc-cardHeadEmpty' : '')
      const groupBytes = group.rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0)
      const busy = pending.length > 0
      return h(
        'section',
        { className: 'dshsc-card' + (group.workspaceId === '' ? ' dshsc-cardLoose' : '') },
        h(
          'header',
          { className: headClass },
          h(
            'button',
            {
              type: 'button',
              className: 'dshsc-chevron',
              'aria-expanded': !collapsed,
              'aria-label': collapsed ? t('panel.action.expand') : t('panel.action.collapse'),
              onClick: onToggleCollapse,
            },
            h(Chevron, { open: !collapsed }),
          ),
          h(
            'span',
            { className: 'dshsc-headStats', title: group.path || group.title },
            h('span', { className: 'dshsc-headSize' }, formatBytes(groupBytes) || '0 B'),
            h('span', null, t('panel.workspaceCount', { count: ids.length })),
          ),
        ),
        collapsed
          ? null
          : group.rows.map((row, index) =>
              h(
                'div',
                {
                  key: row.id,
                  className:
                    'dshsc-row' +
                    (index === 0 ? ' dshsc-rowFirst' : '') +
                    (selection.has(row.id) ? ' dshsc-rowSelected' : ''),
                },
                h(TriCheck, {
                  checked: selection.has(row.id),
                  indeterminate: false,
                  disabled: busy,
                  label: row.title || row.id,
                  onChange: () => onToggleRow(row.id),
                }),
                h(
                  'div',
                  { className: 'dshsc-main', onClick: () => onPreview(row.id) },
                  h(
                    'span',
                    {
                      className: 'dshsc-title' + (row.title === '' ? ' dshsc-titleMuted' : ''),
                      title: row.title || row.id,
                    },
                    row.title || t('panel.unknownSession') + ' · ' + shortId(row.id),
                  ),
                  h(
                    'span',
                    { className: 'dshsc-meta' },
                    formatTime(row.updatedAt) === ''
                      ? null
                      : h('span', null, t('panel.updatedAt', { time: formatTime(row.updatedAt) })),
                    row.cwd === '' ? null : h('span', { title: row.cwd }, '· ' + baseName(row.cwd)),
                    row.running
                      ? h('span', { className: 'dshsc-badge dshsc-badgeRun' }, t('panel.badge.running'))
                      : row.live
                        ? h('span', { className: 'dshsc-badge dshsc-badgeLive' }, t('panel.badge.live'))
                        : null,
                    row.blank ? h('span', { className: 'dshsc-badge' }, t('panel.badge.blank')) : null,
                    row.pinned ? h('span', { className: 'dshsc-badge' }, t('panel.badge.pinned')) : null,
                    row.parentSessionId === null
                      ? null
                      : h('span', { className: 'dshsc-badge' }, t('panel.badge.subagent')),
                  ),
                ),
                formatBytes(row.sizeBytes) === ''
                  ? null
                  : h(
                      'span',
                      { className: 'dshsc-sizeCell' + (row.sizeBytes >= 5 * 1024 * 1024 ? ' dshsc-sizeBig' : '') },
                      formatBytes(row.sizeBytes),
                    ),
                h(RowActions, {
                  row,
                  archived: group.workspaceId === '__archived__',
                  pending: pending.includes(row.id),
                  confirming: confirming === row.id,
                  onArchive,
                  onUnarchive,
                  onDelete,
                  onConfirm,
                  onCancel,
                  t,
                }),
              ),
            ),
      )
    }

    /**
     * Read-only transcript of one stored Session, shown before it is archived or
     * deleted so the decision is made on content rather than on a title.
     * @param props - row, preview state, and the actions the row would offer.
     * @returns the preview column element.
     */
    function PreviewPane({ row, state, confirming, onBack, archived, onArchive, onUnarchive, onDelete, onConfirm, onCancel, t }) {
      const data = state.data
      const title = row === undefined || row.title === '' ? t('panel.unknownSession') + ' · ' + shortId(state.id) : row.title
      const meta = []
      if (data !== null) {
        const size = formatBytes(data.sizeBytes) || '0 B'
        if (Number(data.turnCount) > 0) meta.push(t('panel.preview.records', { count: data.turnCount, size }))
        else meta.push(size)
        if (data.cwd !== '') meta.push(baseName(data.cwd))
      }
      if (row !== undefined && formatTime(row.updatedAt) !== '') meta.push(t('panel.updatedAt', { time: formatTime(row.updatedAt) }))
      const body =
        state.loading === true
          ? h('div', { className: 'dshsc-skeleton' }, t('panel.preview.loading'))
          : state.error !== null
            ? h('div', { className: 'dshsc-notice dshsc-noticeError' }, t('panel.preview.error', { message: state.error }))
            : data === null || data.items.length === 0
              ? h('div', { className: 'dshsc-empty' }, t('panel.preview.empty'))
              : h(
                  'div',
                  { className: 'dshsc-transcript' },
                  ...data.items.map((item) => {
                    const isUser = item.role === 'user'
                    return h(
                      'div',
                      {
                        key: item.role + ':' + String(item.seq),
                        className: 'dshsc-msg' + (isUser ? ' dshsc-msgUser' : ' dshsc-msgAssistant'),
                      },
                      h(
                        'span',
                        {
                          className: 'dshsc-roleChip' + (isUser ? ' dshsc-roleChipUser' : ''),
                        },
                        t(isUser ? 'panel.preview.user' : 'panel.preview.assistant'),
                      ),
                      h('div', { className: 'dshsc-msgText' }, item.text),
                    )
                  }),
                  data.truncated === true
                    ? h(
                        'div',
                        { className: 'dshsc-previewFoot' },
                        t('panel.preview.truncated', { count: data.items.length }),
                      )
                    : null,
                )
      return h(
        'div',
        { className: 'dshsc-preview' },
        h(
          'div',
          { className: 'dshsc-previewHead' },
          h(
            'button',
            { type: 'button', className: 'dshsc-btn dshsc-btnSm dshsc-btnGhost', onClick: onBack },
            t('panel.preview.back'),
          ),
          h('span', { className: 'dshsc-previewTitle', title: state.id }, title),
          row !== undefined && row.running === true
            ? h('span', { className: 'dshsc-badge dshsc-badgeRun' }, t('panel.badge.running'))
            : null,
          row !== undefined && row.live === true && row.running !== true
            ? h('span', { className: 'dshsc-badge dshsc-badgeLive' }, t('panel.badge.live'))
            : null,
          row !== undefined && row.blank === true ? h('span', { className: 'dshsc-badge' }, t('panel.badge.blank')) : null,
          h('span', { className: 'dshsc-spacer' }),
          archived
            ? h(
                'button',
                { type: 'button', className: 'dshsc-btn dshsc-btnSm', onClick: () => onUnarchive(state.id) },
                t('panel.action.unarchive'),
              )
            : h(
                'button',
                { type: 'button', className: 'dshsc-btn dshsc-btnSm', onClick: () => onArchive(state.id) },
                t('panel.action.archive'),
              ),
          confirming === state.id
            ? [
                h(
                  'button',
                  {
                    key: 'confirm',
                    type: 'button',
                    className: 'dshsc-btn dshsc-btnSm dshsc-btnSolidDanger',
                    onClick: () => onConfirm(state.id),
                  },
                  t('panel.action.confirmDelete'),
                ),
                h(
                  'button',
                  { key: 'cancel', type: 'button', className: 'dshsc-btn dshsc-btnSm', onClick: onCancel },
                  t('panel.action.cancel'),
                ),
              ]
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dshsc-btn dshsc-btnSm dshsc-btnDanger',
                  disabled: row !== undefined && row.live === true,
                  title: row !== undefined && row.live === true ? t('panel.hint.live') : undefined,
                  onClick: () => onDelete(state.id),
                },
                t('panel.action.delete'),
              ),
        ),
        meta.length === 0
          ? null
          : h(
              'div',
              { className: 'dshsc-previewMeta' },
              ...meta.map((text, index) => h('span', { key: 'm' + index, className: 'dshsc-previewChip' }, text)),
            ),
        body,
      )
    }

    /**
     * The cleanup panel rendered into the `main` slot for this plugin's id.
     * @param props - Slot props; `t` is the bound locale translator.
     * @returns the panel element.
     */
    function CleanupPage(props) {
      const t = props.t ?? ((key) => key)
      const refreshSessions = typeof props.refreshSessions === 'function' ? props.refreshSessions : () => {}
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [pending, setPending] = React.useState([])
      const [confirming, setConfirming] = React.useState(null)
      const [confirmBulk, setConfirmBulk] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [sort, setSort] = React.useState('updated')
      const [activeView, setActiveView] = React.useState(null)
      const [preview, setPreview] = React.useState(null)
      const [selected, setSelected] = React.useState(function () {
        return new Set()
      })
      const [collapsedGroups, setCollapsedGroups] = React.useState(function () {
        return new Set()
      })
      const [purgeTarget, setPurgeTarget] = React.useState(null)
      const [confirmEmpty, setConfirmEmpty] = React.useState(false)
      const [confirmCache, setConfirmCache] = React.useState(false)
      const [trashSelected, setTrashSelected] = React.useState(function () {
        return new Set()
      })
      const [confirmTrashPurge, setConfirmTrashPurge] = React.useState(false)
      const [confirmTrashPurgeKeys, setConfirmTrashPurgeKeys] = React.useState(function () {
        return []
      })
      const alive = React.useRef(true)

      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
          const next = await request(STATE_PATH)
          if (alive.current) setData(next)
        } catch (cause) {
          if (alive.current) setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          if (alive.current) setLoading(false)
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const archivedSet = React.useMemo(() => new Set(data?.archivedSessionIds ?? []), [data])
      const pinnedSet = React.useMemo(() => new Set(data?.pinnedSessionIds ?? []), [data])
      const rows = React.useMemo(
        () => (data?.sessions ?? []).map((row) => ({ ...row, pinned: pinnedSet.has(row.id) })),
        [data, pinnedSet],
      )
      const sessionById = React.useMemo(() => {
        const map = new Map()
        for (const row of rows) map.set(row.id, row)
        return map
      }, [rows])
      // Archive ids whose log is gone: nothing can render or restore them.
      const orphanCount = Math.max(0, archivedSet.size - rows.filter((row) => archivedSet.has(row.id)).length)

      const comparator = React.useMemo(() => byRowOrder(pinnedSet, sort), [pinnedSet, sort])

      // Left rail: one entry per workspace plus the fixed views. Counts here are
      // global truth (never narrowed by the search box), so the rail still shows
      // where the sessions are while a filter hides them.
      const nav = React.useMemo(() => {
        const workspaces = data?.workspaces ?? []
        const activeRows = rows.filter((row) => !archivedSet.has(row.id))
        const claimed = new Set()
        const entries = workspaces.map((workspace) => {
          const ids = new Set(workspace.sessionIds)
          for (const id of ids) claimed.add(id)
          const members = activeRows.filter((row) => ids.has(row.id))
          return {
            id: workspace.workspaceId,
            name: workspace.title || workspace.path || t('panel.ungrouped'),
            path: workspace.path,
            count: members.length,
            bytes: members.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
            rows: members,
          }
        })
        return {
          entries,
          stray: activeRows.filter((row) => !claimed.has(row.id)),
          archivedRows: rows.filter((row) => archivedSet.has(row.id)),
        }
      }, [data, rows, archivedSet, t])

      // The rail has no aggregate entry, so a fresh panel opens the first
      // workspace that actually holds sessions (falling back to the first
      // registered one, then to the loose/archived groups).
      const defaultView = React.useMemo(() => {
        if (nav.entries.length > 0) {
          const populated = nav.entries.find((entry) => entry.count > 0)
          return (populated ?? nav.entries[0]).id
        }
        if (nav.stray.length > 0) return '__ungrouped__'
        return '__archived__'
      }, [nav])

      // `activeView` is null until the first state read resolves; rendering uses
      // the derived view so there is never an empty first frame.
      const currentView = activeView ?? defaultView

      // Cross-workspace selections are easy to miss. Switching the left rail
      // clears the selection so a later bulk action cannot include hidden rows.
      // A search filter in the same view keeps the selection, and the dock names
      // how many selected rows are currently hidden.
      const selectView = React.useCallback(
        (id) => {
          if (id !== currentView) {
            setSelected(new Set())
            setConfirming(null)
            setConfirmBulk(false)
            setPurgeTarget(null)
            setConfirmEmpty(false)
            setConfirmCache(false)
            setTrashSelected(new Set())
            setConfirmTrashPurge(false)
            setConfirmTrashPurgeKeys([])
          }
          setActiveView(id)
        },
        [currentView],
      )

      const view = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        const matches = (row) =>
          needle === '' || (row.title + ' ' + row.id + ' ' + row.cwd).toLowerCase().includes(needle)
        const card = (workspaceId, title, path, members) => ({
          workspaceId,
          title,
          path,
          rows: members.filter(matches).sort(comparator),
        })
        const groups = []
        let archivedGroup = null
        if (currentView === '__archived__') {
          const archived = card('__archived__', t('panel.section.archived'), '', nav.archivedRows)
          if (archived.rows.length > 0) archivedGroup = archived
        } else if (currentView === '__ungrouped__') {
          const group = card('', '', '', nav.stray)
          if (group.rows.length > 0) groups.push(group)
        } else {
          const entry = nav.entries.find((candidate) => candidate.id === currentView)
          if (entry !== undefined) {
            const group = card(entry.id, entry.name, entry.path, entry.rows)
            if (group.rows.length > 0) groups.push(group)
          }
        }
        return { groups, archivedGroup }
      }, [currentView, nav, query, comparator, t])

      // A preview is scoped to one Session inside one view. Switching the rail
      // must follow, so close it instead of leaving a stale transcript behind.
      React.useEffect(() => {
        setPreview(null)
      }, [currentView])

      // Keep the rail selection valid after a refresh removes a workspace.
      React.useEffect(() => {
        if (data === null) return
        setActiveView((current) => {
          if (current === null) return defaultView
          if (current === '__trash__' || current === '__archived__' || current === '__ungrouped__') return current
          if (current === '__cache__') {
            return data?.orphanCache?.available === false ? defaultView : current
          }
          return nav.entries.some((entry) => entry.id === current) ? current : defaultView
        })
      }, [data, nav, defaultView])

      const visibleIds = React.useMemo(() => {
        const ids = []
        for (const group of view.groups) for (const row of group.rows) ids.push(row.id)
        if (view.archivedGroup !== null) for (const row of view.archivedGroup.rows) ids.push(row.id)
        return ids
      }, [view])

      // Drop selections whose session disappeared after a delete or refresh.
      React.useEffect(() => {
        setSelected((current) => {
          let changed = false
          const next = new Set()
          for (const id of current) {
            if (sessionById.has(id)) next.add(id)
            else changed = true
          }
          return changed ? next : current
        })
      }, [sessionById])

      const selection = selected
      const selectedIds = React.useMemo(() => {
        const ids = []
        for (const id of selection) if (sessionById.has(id)) ids.push(id)
        return ids
      }, [selection, sessionById])
      const selectedBytes = selectedIds.reduce((sum, id) => sum + (sessionById.get(id)?.sizeBytes ?? 0), 0)
      const selectedLive = selectedIds.filter((id) => sessionById.get(id)?.live === true)
      const deletableIds = selectedIds.filter((id) => sessionById.get(id)?.live !== true)
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id))
      const someVisibleSelected = visibleIds.some((id) => selection.has(id))

      const toggleRow = React.useCallback((id) => {
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        setConfirming(null)
        setConfirmBulk(false)
      }, [])

      /**
       * Open the transcript of one Session. The request is keyed by id so a slow
       * read can never overwrite a preview the user already moved on from.
       * @param id - Session to preview.
       */
      const openPreview = React.useCallback(async (id) => {
        setPreview({ id, loading: true, error: null, data: null })
        try {
          const next = await request(PREVIEW_PATH + '?id=' + encodeURIComponent(id))
          if (!alive.current) return
          setPreview((current) =>
            current === null || current.id !== id ? current : { id, loading: false, error: null, data: next },
          )
        } catch (cause) {
          if (!alive.current) return
          const message = cause instanceof Error ? cause.message : String(cause)
          setPreview((current) =>
            current === null || current.id !== id ? current : { id, loading: false, error: message, data: null },
          )
        }
      }, [])

      const closePreview = React.useCallback(() => setPreview(null), [])

      const toggleAll = React.useCallback(() => {
        setSelected((current) => {
          const next = new Set(current)
          if (allVisibleSelected) for (const id of visibleIds) next.delete(id)
          else for (const id of visibleIds) next.add(id)
          return next
        })
        setConfirmBulk(false)
      }, [allVisibleSelected, visibleIds])

      const clearSelection = React.useCallback(() => {
        setSelected(new Set())
        setConfirming(null)
        setConfirmBulk(false)
      }, [])

      const toggleCollapse = React.useCallback((key) => {
        setCollapsedGroups((current) => {
          const next = new Set(current)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }, [])

      const run = React.useCallback(
        async (op, ids) => {
          if (ids.length === 0) {
            setNotice({ kind: 'info', text: t('panel.notice.empty') })
            return
          }
          setPending(ids)
          setNotice(null)
          try {
            const labels = {}
            if (op === 'delete') {
              for (const id of ids) {
                const row = sessionById.get(id)
                if (row !== undefined && row.title !== '') labels[id] = row.title
              }
            }
            const result = await act({ op, sessionIds: ids, labels })
            const outcomes = result?.results ?? []
            const skipped = outcomes.filter((outcome) => outcome.skipped === true)
            const failed = outcomes.filter((outcome) => outcome.ok !== true && outcome.skipped !== true)
            const ok = outcomes.filter((outcome) => outcome.ok === true).length
            if (op === 'delete' && failed.length === 0 && skipped.length === 0) {
              setNotice({ kind: 'info', text: t('panel.notice.deleted', { count: ok }) })
            } else {
              let text = t('panel.notice.summary', { ok, failed: failed.length, skipped: skipped.length })
              if (failed.length > 0) text += ' ' + t('panel.notice.firstError', { message: firstFailure(failed) })
              if (skipped.length > 0) text += ' ' + t('panel.notice.firstSkip', { message: firstFailure(skipped) })
              setNotice({ kind: failed.length === 0 ? 'info' : 'error', text })
            }
            if (alive.current && result?.state !== undefined) setData(result.state)
            else await load()
            if (alive.current) {
              const done = new Set(ids.filter((id, index) => outcomes[index]?.ok === true))
              setSelected((current) => {
                const next = new Set()
                for (const id of current) if (!done.has(id)) next.add(id)
                return next
              })
              // A successful delete or restore changes what the sidebar lists, so
              // push the same truth into the client Session store.
              if (done.size > 0) {
                setPreview((current) => (current !== null && done.has(current.id) ? null : current))
                refreshSessions()
              }
            }
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
            await load()
          } finally {
            if (alive.current) {
              setPending([])
              setConfirming(null)
              setConfirmBulk(false)
            }
          }
        },
        [load, refreshSessions, sessionById, t],
      )

      const onArchive = React.useCallback((id) => run('archive', [id]), [run])
      const onUnarchive = React.useCallback((id) => run('unarchive', [id]), [run])
      const onDelete = React.useCallback((id) => setConfirming(id), [])
      const onConfirm = React.useCallback((id) => run('delete', [id]), [run])
      const onCancel = React.useCallback(() => setConfirming(null), [])

      React.useEffect(() => {
        if (!(confirming || confirmBulk || purgeTarget || confirmEmpty || confirmCache || confirmTrashPurge)) return
        const doc = typeof document === 'undefined' ? null : document
        const node = typeof doc?.querySelector === 'function' ? doc.querySelector('.dshsc-btnSolidDanger') : null
        if (typeof node?.focus === 'function') node.focus()
      }, [confirming, confirmBulk, purgeTarget, confirmEmpty, confirmCache, confirmTrashPurge])

      React.useEffect(() => {
        const doc = typeof document === 'undefined' ? null : document
        if (typeof doc?.addEventListener !== 'function') return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          const armed = confirming !== null || confirmBulk || purgeTarget !== null || confirmEmpty || confirmCache || confirmTrashPurge
          if (armed) {
            setConfirming(null)
            setConfirmBulk(false)
            setPurgeTarget(null)
            setConfirmEmpty(false)
            setConfirmCache(false)
            setConfirmTrashPurge(false)
            setConfirmTrashPurgeKeys([])
            event.preventDefault()
            return
          }
          if (preview !== null) {
            setPreview(null)
            event.preventDefault()
          }
        }
        doc.addEventListener('keydown', onKey)
        return () => {
          if (typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', onKey)
        }
      }, [confirming, confirmBulk, purgeTarget, confirmEmpty, confirmCache, confirmTrashPurge, preview])

      /**
       * Post one non-session action and fold its state back in.
       * @param body - Action payload.
       * @param describe - Builds the success notice from the response.
       * @param busyKey - Pending key for the triggering control.
       */
      const runSimple = React.useCallback(
        async (body, describe, busyKey) => {
          setPending([busyKey])
          setNotice(null)
          try {
            const result = await act(body)
            const outcome = result?.results?.[0] ?? {}
            const failures = Array.isArray(outcome.failures) ? outcome.failures : []
            const message = outcome.error ?? firstFailure(failures)
            const summary = describe(result)
            if (outcome.ok !== true) {
              const errorText = t('panel.notice.firstError', { message: message || 'unknown' })
              setNotice({ kind: 'error', text: summary ? `${summary} ${errorText}` : errorText })
            } else {
              setNotice({ kind: 'info', text: summary })
            }
            if (alive.current && result?.state !== undefined) setData(result.state)
            else await load()
            if (outcome.ok === true || Number(outcome.restored ?? 0) > 0 || Number(outcome.purged ?? 0) > 0) {
              refreshSessions()
            }
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
            await load()
          } finally {
            if (alive.current) {
              setPending([])
              setPurgeTarget(null)
              setConfirmEmpty(false)
              setConfirmCache(false)
            }
          }
        },
        [load, refreshSessions, t],
      )

      /**
       * Restore or purge one recycle-bin entry.
       * @param op - restore | purge.
       * @param batch - Batch directory name.
       * @param sessionId - Optional single session; omitted means the whole batch.
       * @param count - Affected session count, for the notice.
       */
      const runBatch = React.useCallback(
        (op, batch, sessionId, count) => {
          const body = { op, batch }
          if (sessionId !== undefined) body.sessionIds = [sessionId]
          return runSimple(
            body,
            (result) => {
              const outcome = result?.results?.[0] ?? {}
              if (op === 'restore') {
                return t('panel.trash.restored', { count: outcome.restored ?? count ?? 0 })
              }
              return t('panel.trash.purged', { count: outcome.purged ?? count ?? 1 })
            },
            sessionId ?? batch,
          )
        },
        [runSimple, t],
      )

      const trashKeyOf = (batch, sessionId) => batch + '\t' + sessionId

      const trashItems = React.useMemo(() => {
        const rows = []
        for (const batch of data?.trash ?? []) {
          for (const item of batch.items ?? []) {
            rows.push({ batch: batch.batch, sessionId: item.sessionId, item, total: batch.items.length })
          }
        }
        return rows
      }, [data])

      React.useEffect(() => {
        const live = new Set(trashItems.map((row) => trashKeyOf(row.batch, row.sessionId)))
        setTrashSelected((current) => {
          let changed = false
          const next = new Set()
          for (const key of current) {
            if (live.has(key)) next.add(key)
            else changed = true
          }
          return changed ? next : current
        })
      }, [trashItems])

      const visibleTrashKeys = React.useMemo(
        () => trashItems.map((row) => trashKeyOf(row.batch, row.sessionId)),
        [trashItems],
      )
      const visibleTrashSelected = visibleTrashKeys.filter((key) => trashSelected.has(key))
      const hiddenTrashSelected = Math.max(0, trashSelected.size - visibleTrashSelected.length)

      const sameTrashKeys = (left, right) => {
        if (left.length !== right.length) return false
        const a = [...left].sort()
        const b = [...right].sort()
        for (let index = 0; index < a.length; index += 1) {
          if (a[index] !== b[index]) return false
        }
        return true
      }

      React.useEffect(() => {
        if (confirmTrashPurge !== true) return
        if (!sameTrashKeys(visibleTrashSelected, confirmTrashPurgeKeys)) {
          setConfirmTrashPurge(false)
          setConfirmTrashPurgeKeys([])
        }
      }, [confirmTrashPurge, confirmTrashPurgeKeys, visibleTrashSelected])

      const toggleTrashItem = React.useCallback((batch, sessionId) => {
        const key = trashKeyOf(batch, sessionId)
        setTrashSelected((current) => {
          const next = new Set(current)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        setConfirmTrashPurge(false)
        setConfirmTrashPurgeKeys([])
      }, [])

      const toggleTrashBatch = React.useCallback((batchName, sessionIds) => {
        setTrashSelected((current) => {
          const keys = sessionIds.map((sessionId) => trashKeyOf(batchName, sessionId))
          const allOn = keys.length > 0 && keys.every((key) => current.has(key))
          const next = new Set(current)
          if (allOn) for (const key of keys) next.delete(key)
          else for (const key of keys) next.add(key)
          return next
        })
        setConfirmTrashPurge(false)
        setConfirmTrashPurgeKeys([])
      }, [])

      const parseTrashKey = (key) => {
        const at = key.indexOf('\t')
        if (at <= 0 || at === key.length - 1) return null
        return { batch: key.slice(0, at), sessionId: key.slice(at + 1) }
      }

      const groupsFromTrashKeys = (keys) => {
        const live = new Set(trashItems.map((row) => trashKeyOf(row.batch, row.sessionId)))
        const groups = new Map()
        for (const key of keys) {
          if (!live.has(key)) continue
          const parsed = parseTrashKey(key)
          if (parsed === null) continue
          const list = groups.get(parsed.batch) ?? []
          list.push(parsed.sessionId)
          groups.set(parsed.batch, list)
        }
        return groups
      }

      const runTrashSelected = React.useCallback(
        async (op) => {
          const sourceKeys =
            op === 'purge' && confirmTrashPurge === true ? confirmTrashPurgeKeys : visibleTrashSelected
          const groups = groupsFromTrashKeys(sourceKeys)
          if (groups.size === 0) {
            setNotice({ kind: 'info', text: t('panel.notice.empty') })
            setConfirmTrashPurge(false)
            setConfirmTrashPurgeKeys([])
            return
          }
          if (op === 'purge' && confirmTrashPurge !== true) {
            setConfirmTrashPurgeKeys([...visibleTrashSelected])
            setConfirmTrashPurge(true)
            return
          }
          setConfirmTrashPurge(false)
          setConfirmTrashPurgeKeys([])
          setPending(['trash-selection'])
          setNotice(null)
          const failedKeys = new Set()
          const succeededKeys = new Set()
          let restored = 0
          let purged = 0
          const failureDetails = []
          let lastState
          try {
            for (const [batch, ids] of groups) {
              const body = { op, batch, sessionIds: ids }
              const result = await act(body)
              const outcome = result?.results?.[0] ?? {}
              restored += Number(outcome.restored ?? 0)
              purged += Number(outcome.purged ?? 0)
              const failures = Array.isArray(outcome.failures) ? outcome.failures : []
              for (const failure of failures) {
                if (failure?.sessionId) failedKeys.add(trashKeyOf(batch, failure.sessionId))
                failureDetails.push(failure)
              }
              if (outcome.ok !== true && failures.length === 0 && outcome.error) {
                failureDetails.push(outcome)
                for (const id of ids) failedKeys.add(trashKeyOf(batch, id))
              }
              for (const id of ids) {
                const key = trashKeyOf(batch, id)
                if (!failedKeys.has(key)) succeededKeys.add(key)
              }
              if (result?.state !== undefined) lastState = result.state
            }
            if (alive.current && lastState !== undefined) setData(lastState)
            else await load()
            setTrashSelected((current) => {
              const next = new Set(current)
              for (const key of succeededKeys) next.delete(key)
              return next
            })
            const summary =
              op === 'restore'
                ? t('panel.trash.restored', { count: restored })
                : t('panel.trash.purged', { count: purged })
            if (failureDetails.length > 0) {
              const errorText = t('panel.notice.firstError', { message: firstFailure(failureDetails) })
              setNotice({ kind: 'error', text: `${summary} ${errorText}` })
            } else {
              setNotice({ kind: 'info', text: summary })
            }
            if (succeededKeys.size > 0) refreshSessions()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
            await load()
          } finally {
            if (alive.current) {
              setPending([])
              setConfirmTrashPurge(false)
              setConfirmTrashPurgeKeys([])
            }
          }
        },
        [confirmTrashPurge, confirmTrashPurgeKeys, load, refreshSessions, t, trashItems, visibleTrashSelected],
      )

      const bulkDelete = React.useCallback(() => {
        if (deletableIds.length === 0) {
          setNotice({ kind: 'error', text: t('panel.hint.live') })
          return
        }
        if (!confirmBulk) {
          setConfirmBulk(true)
          return
        }
        run('delete', deletableIds)
      }, [confirmBulk, deletableIds, run, t])

      const emptyText = () => {
        if (query.trim() !== '') return t('panel.emptyFilter', { query: query.trim() })
        if (currentView === '__archived__') return t('panel.nav.emptyArchived')
        return t('panel.empty')
      }

      const sections = []
      if (loading && data === null) {
        sections.push(h('div', { className: 'dshsc-skeleton', key: 'loading' }, t('panel.loading')))
      } else if (view.groups.length === 0 && view.archivedGroup === null) {
        sections.push(
          h(EmptyState, {
            key: 'empty',
            icon: 'inbox',
            title: emptyText(),
            hint:
              query.trim() === '' && nav.entries.some((entry) => entry.id === currentView) ? t('panel.emptyHint') : undefined,
          }),
        )
      } else {
        for (const group of view.groups) {
          const key = group.workspaceId === '' ? '__ungrouped__' : group.workspaceId
          sections.push(
            h(GroupCard, {
              key,
              group,
              selection,
              pending,
              confirming,
              collapsed: collapsedGroups.has(key),
              onToggleCollapse: () => toggleCollapse(key),
              onToggleRow: toggleRow,
              onPreview: openPreview,
              onArchive,
              onUnarchive,
              onDelete,
              onConfirm,
              onCancel,
              t,
            }),
          )
        }
        if (view.archivedGroup !== null) {
          const key = '__archived__'
          sections.push(
            h(GroupCard, {
              key,
              group: view.archivedGroup,
              selection,
              pending,
              confirming,
              collapsed: collapsedGroups.has(key),
              onToggleCollapse: () => toggleCollapse(key),
              onToggleRow: toggleRow,
              onPreview: openPreview,
              onArchive,
              onUnarchive,
              onDelete,
              onConfirm,
              onCancel,
              t,
            }),
          )
        }
      }

      const orphanSection =
        orphanCount === 0
          ? null
          : h(
              'section',
              { className: 'dshsc-card dshsc-cardLoose' },
              h(
                'header',
                { className: 'dshsc-cardHead' },
                h('span', { className: 'dshsc-cardTitle' }, t('panel.orphan.title')),
                h('span', { className: 'dshsc-spacer' }),
                h('span', { className: 'dshsc-pill' }, String(orphanCount)),
              ),
              h(
                'div',
                { className: 'dshsc-row dshsc-rowFirst' },
                h(
                  'div',
                  { className: 'dshsc-main dshsc-mainStatic' },
                  h('span', { className: 'dshsc-meta' }, t('panel.orphan.body', { count: orphanCount })),
                ),
                h(
                  'div',
                  { className: 'dshsc-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshsc-btn dshsc-btnSm',
                      disabled: pending.length > 0,
                      onClick: () =>
                        runSimple({ op: 'pruneArchived' }, (result) =>
                          t('panel.orphan.done', { count: result?.pruned ?? 0 }),
                        ),
                    },
                    t('panel.orphan.action', { count: orphanCount }),
                  ),
                ),
              ),
            )

      const orphanCache = data?.orphanCache ?? { available: true, count: 0, bytes: 0 }
      const cacheSection =
        orphanCache.available !== true
          ? null
          : orphanCache.count === 0
            ? null
            : h(
                'section',
                { className: 'dshsc-card dshsc-cardLoose' },
                h(
                  'header',
                  { className: 'dshsc-cardHead' },
                  h('span', { className: 'dshsc-cardTitle' }, t('panel.cache.title')),
                  h('span', { className: 'dshsc-spacer' }),
                  h('span', { className: 'dshsc-size' }, formatBytes(orphanCache.bytes)),
                  h('span', { className: 'dshsc-pill' }, String(orphanCache.count)),
                ),
                h(
                  'div',
                  { className: 'dshsc-row dshsc-rowFirst' },
                  h(
                    'div',
                    { className: 'dshsc-main dshsc-mainStatic' },
                    h(
                      'span',
                      { className: 'dshsc-meta' },
                      t('panel.cache.body', { count: orphanCache.count, size: formatBytes(orphanCache.bytes) }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'dshsc-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshsc-btn dshsc-btnSm dshsc-btnDanger',
                        disabled: pending.length > 0,
                        onClick: () => setConfirmCache(true),
                      },
                      t('panel.cache.action', { count: orphanCache.count }),
                    ),
                    confirmCache
                      ? [
                          h('span', { key: 'warn', className: 'dshsc-confirmText' }, t('panel.cache.confirm', { count: orphanCache.count })),
                          h(
                            'button',
                            {
                              key: 'confirm',
                              type: 'button',
                              className: 'dshsc-btn dshsc-btnSm dshsc-btnSolidDanger',
                              disabled: pending.length > 0,
                              onClick: () =>
                                runSimple({ op: 'pruneOrphanCache' }, (result) =>
                                  t('panel.cache.done', {
                                    count: result?.removed ?? 0,
                                    size: formatBytes(result?.freed ?? 0) || '0 B',
                                  }),
                                ),
                            },
                            t('panel.action.confirmCache'),
                          ),
                          h(
                            'button',
                            {
                              key: 'cancel',
                              type: 'button',
                              className: 'dshsc-btn dshsc-btnSm',
                              disabled: pending.length > 0,
                              onClick: () => setConfirmCache(false),
                            },
                            t('panel.action.cancel'),
                          ),
                        ]
                      : null,
                  ),
                ),
              )

      const trashBatches = data?.trash ?? []
      // Trash bulk bar: same bottom-dock pattern as the session view's dock, so
      // both selection toolbars share one position and one button scale. Like the
      // session dock it only exists once something is selected.
      const trashDock =
        trashBatches.length === 0 || trashSelected.size === 0
          ? null
          : h(
              'div',
              { className: 'dshsc-dock dshsc-dockFoot', key: 'trash-dock' },
              h(
                'span',
                { className: 'dshsc-dockInfo' },
                t('panel.bulk.selected', { count: visibleTrashSelected.length }),
              ),
              hiddenTrashSelected > 0
                ? h(
                    'span',
                    { className: 'dshsc-dockHint' },
                    t('panel.bulk.hiddenFilter', { count: hiddenTrashSelected }),
                  )
                : null,
              confirmTrashPurge
                ? h(
                    'span',
                    { className: 'dshsc-confirmText' },
                    t('panel.trash.confirmPurgeSelected', { count: confirmTrashPurgeKeys.length }),
                  )
                : null,
              h('span', { className: 'dshsc-spacer' }),
              h(
                'div',
                { className: 'dshsc-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshsc-btn',
                    disabled: visibleTrashSelected.length === 0 || pending.length > 0,
                    onClick: () => runTrashSelected('restore'),
                  },
                  t('panel.trash.restoreSelected'),
                ),
                confirmTrashPurge
                  ? [
                      h(
                        'button',
                        {
                          key: 'confirm',
                          type: 'button',
                          className: 'dshsc-btn dshsc-btnSolidDanger',
                          disabled: visibleTrashSelected.length === 0 || pending.length > 0,
                          onClick: () => runTrashSelected('purge'),
                        },
                        t('panel.action.confirmDelete'),
                      ),
                      h(
                        'button',
                        {
                          key: 'cancel',
                          type: 'button',
                          className: 'dshsc-btn',
                          disabled: pending.length > 0,
                          onClick: () => {
                            setConfirmTrashPurge(false)
                            setConfirmTrashPurgeKeys([])
                          },
                        },
                        t('panel.action.cancel'),
                      ),
                    ]
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshsc-btn dshsc-btnSolidDanger',
                        disabled: visibleTrashSelected.length === 0 || pending.length > 0,
                        onClick: () => runTrashSelected('purge'),
                      },
                      t('panel.trash.purgeSelected'),
                    ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshsc-btn dshsc-btnGhost',
                    disabled: pending.length > 0,
                    onClick: () => setTrashSelected(new Set()),
                  },
                  t('panel.action.clear'),
                ),
              ),
            )

      const trashSection =
        trashBatches.length === 0
          ? null
          : h(
              'section',
              { className: 'dshsc-card' },
              h(
                'header',
                { className: 'dshsc-cardHead' },
                h('span', { className: 'dshsc-cardTitle' }, t('panel.trash.title')),
                h('span', { className: 'dshsc-spacer' }),
                confirmEmpty
                  ? [
                      h('span', { key: 'warn', className: 'dshsc-confirmText' }, t('panel.trash.confirmEmpty')),
                      h(
                        'button',
                        {
                          key: 'confirm',
                          type: 'button',
                          className: 'dshsc-btn dshsc-btnSm dshsc-btnSolidDanger',
                          disabled: pending.length > 0,
                          onClick: () =>
                            runSimple({ op: 'emptyTrash' }, (result) =>
                              t('panel.trash.emptied', {
                                count: result?.purgedSessions ?? result?.purged ?? 0,
                                batches: result?.purgedBatches ?? 0,
                              }),
                            ),
                        },
                        t('panel.action.confirmDelete'),
                      ),
                      h(
                        'button',
                        {
                          key: 'cancel',
                          type: 'button',
                          className: 'dshsc-btn dshsc-btnSm',
                          disabled: pending.length > 0,
                          onClick: () => setConfirmEmpty(false),
                        },
                        t('panel.action.cancel'),
                      ),
                    ]
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshsc-btn dshsc-btnSm dshsc-btnDanger',
                        disabled: pending.length > 0,
                        onClick: () => setConfirmEmpty(true),
                      },
                      t('panel.trash.emptyAll'),
                    ),
                h(
                  'span',
                  { className: 'dshsc-pill' },
                  String(trashBatches.reduce((sum, batch) => sum + batch.count, 0)),
                ),
              ),
              h(
                'div',
                { className: 'dshsc-row dshsc-rowFirst' },
                h(
                  'div',
                  { className: 'dshsc-main dshsc-mainStatic' },
                  h('span', { className: 'dshsc-meta' }, t('panel.trash.subtitle')),
                ),
              ),
              ...trashBatches.flatMap((batch) => {
                const busy = pending.includes(batch.batch) || pending.includes('trash-selection')
                const time = formatTime(Date.parse(batch.createdAt))
                const key = batch.batch
                const batchIds = (batch.items ?? []).map((item) => item.sessionId)
                const batchKeys = batchIds.map((sessionId) => trashKeyOf(key, sessionId))
                const selectedInBatch = batchKeys.filter((itemKey) => trashSelected.has(itemKey)).length
                const allInBatch = batchKeys.length > 0 && selectedInBatch === batchKeys.length
                const someInBatch = selectedInBatch > 0 && !allInBatch
                const rowsOut = [
                  h(
                    'div',
                    { key: key + ':head', className: 'dshsc-row' + (allInBatch ? ' dshsc-rowSelected' : '') },
                    h(TriCheck, {
                      checked: allInBatch,
                      indeterminate: someInBatch,
                      disabled: busy || batchIds.length === 0,
                      label: t('panel.trash.selectBatch'),
                      onChange: () => toggleTrashBatch(key, batchIds),
                    }),
                    h(
                      'div',
                      { className: 'dshsc-main dshsc-mainStatic' },
                      h(
                        'span',
                        { className: 'dshsc-title', title: batch.batch },
                        time === '' ? batch.batch : time,
                      ),
                      h(
                        'span',
                        { className: 'dshsc-meta' },
                        h(
                          'span',
                          null,
                          t('panel.trash.batchMeta', {
                            count: batch.count,
                            size: formatBytes(batch.bytes) || '0 B',
                          }),
                        ),
                        selectedInBatch > 0
                          ? h(
                              'span',
                              { className: 'dshsc-pill' },
                              t('panel.trash.batchChecked', { selected: selectedInBatch, count: batch.count }),
                            )
                          : null,
                      ),
                    ),
                  ),
                ]
                for (const item of batch.items) {
                  const itemKey = key + ':' + item.sessionId
                  const itemBusy = pending.includes(item.sessionId)
                  const confirmingItem = purgeTarget === itemKey
                  const itemSelected = trashSelected.has(trashKeyOf(key, item.sessionId))
                  rowsOut.push(
                    h(
                      'div',
                      {
                        key: itemKey,
                        className: 'dshsc-row dshsc-rowNested' + (itemSelected ? ' dshsc-rowSelected' : ''),
                      },
                      h(TriCheck, {
                        checked: itemSelected,
                        indeterminate: false,
                        disabled: itemBusy || busy,
                        label: item.title || t('panel.trash.itemFallback') + ' · ' + shortId(item.sessionId),
                        onChange: () => toggleTrashItem(key, item.sessionId),
                      }),
                      h(
                        'div',
                        { className: 'dshsc-main dshsc-mainStatic' },
                        h(
                          'span',
                          {
                            className: 'dshsc-title' + (item.title === '' ? ' dshsc-titleMuted' : ''),
                            title: item.sessionId,
                          },
                          item.title || t('panel.trash.itemFallback') + ' · ' + shortId(item.sessionId),
                        ),
                        h(
                          'span',
                          { className: 'dshsc-meta' },
                          item.cwdDir === '' ? null : h('span', null, item.cwdDir),
                          formatBytes(item.size) === ''
                            ? null
                            : h('span', { className: 'dshsc-size' }, formatBytes(item.size)),
                        ),
                        confirmingItem
                          ? h('span', { className: 'dshsc-confirmText' }, t('panel.trash.confirmPurge'))
                          : null,
                      ),
                      h(
                        'div',
                        { className: 'dshsc-actions' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dshsc-btn dshsc-btnSm',
                            disabled: itemBusy || busy,
                            onClick: () => runBatch('restore', batch.batch, item.sessionId, 1),
                          },
                          t('panel.trash.restore'),
                        ),
                        confirmingItem
                          ? [
                              h(
                                'button',
                                {
                                  key: 'confirm',
                                  type: 'button',
                                  className: 'dshsc-btn dshsc-btnSm dshsc-btnSolidDanger',
                                  disabled: itemBusy || busy,
                                  onClick: () => runBatch('purge', batch.batch, item.sessionId, 1),
                                },
                                t('panel.action.confirmDelete'),
                              ),
                              h(
                                'button',
                                {
                                  key: 'cancel',
                                  type: 'button',
                                  className: 'dshsc-btn dshsc-btnSm',
                                  disabled: itemBusy || busy,
                                  onClick: () => setPurgeTarget(null),
                                },
                                t('panel.action.cancel'),
                              ),
                            ]
                          : h(
                              'button',
                              {
                                type: 'button',
                                className: 'dshsc-btn dshsc-btnSm dshsc-btnDanger',
                                disabled: itemBusy || busy,
                                onClick: () => setPurgeTarget(itemKey),
                              },
                              t('panel.trash.purge'),
                            ),
                      ),
                    ),
                  )
                }
                return rowsOut
              }),
            )

      const dock =
        selectedIds.length === 0
          ? null
          : h(
              'div',
              { className: 'dshsc-dock dshsc-dockFoot' },
              h('span', { className: 'dshsc-dockInfo' }, t('panel.bulk.selected', { count: selectedIds.length })),
              formatBytes(selectedBytes) === ''
                ? null
                : h('span', { className: 'dshsc-dockHint' }, t('panel.bulk.size', { size: formatBytes(selectedBytes) })),
              selectedLive.length > 0
                ? h('span', { className: 'dshsc-dockHint' }, t('panel.bulk.skipLive', { count: selectedLive.length }))
                : null,
              selectedIds.some((id) => !visibleIds.includes(id))
                ? h(
                    'span',
                    { className: 'dshsc-dockHint' },
                    t('panel.bulk.hiddenFilter', {
                      count: selectedIds.filter((id) => !visibleIds.includes(id)).length,
                    }),
                  )
                : null,
              confirmBulk
                ? h('span', { className: 'dshsc-confirmText' }, t('panel.bulk.confirm', { count: deletableIds.length }))
                : null,
              h('span', { className: 'dshsc-spacer' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshsc-btn',
                  disabled: pending.length > 0,
                  onClick: () => run('archive', selectedIds),
                },
                t('panel.bulk.archive'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshsc-btn',
                  disabled: pending.length > 0,
                  onClick: () => run('unarchive', selectedIds),
                },
                t('panel.bulk.unarchive'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshsc-btn dshsc-btnSolidDanger',
                  disabled: pending.length > 0 || deletableIds.length === 0,
                  title: deletableIds.length === 0 ? t('panel.hint.live') : undefined,
                  onClick: bulkDelete,
                },
                confirmBulk
                  ? t('panel.action.confirmDelete')
                  : t('panel.bulk.delete') + ' (' + String(deletableIds.length) + ')',
              ),
              confirmBulk
                ? h(
                    'button',
                    { type: 'button', className: 'dshsc-btn', disabled: pending.length > 0, onClick: () => setConfirmBulk(false) },
                    t('panel.action.cancel'),
                  )
                : null,
              h(
                'button',
                { type: 'button', className: 'dshsc-btn dshsc-btnGhost', disabled: pending.length > 0, onClick: clearSelection },
                t('panel.action.clear'),
              ),
            )

      const stats = data?.stats
      const statsRow =
        stats === undefined
          ? null
          : h(
              'div',
              { className: 'dshsc-stats' },
              h(
                'span',
                { className: 'dshsc-stat' },
                t('panel.stats.sessions', {
                  count: stats.sessionCount,
                  size: formatBytes(stats.sessionsBytes) || '0 B',
                }),
              ),
              stats.trashCount === 0
                ? null
                : h(
                    'span',
                    { className: 'dshsc-stat' },
                    t('panel.stats.trash', {
                      count: stats.trashCount,
                      size: formatBytes(stats.trashBytes) || '0 B',
                    }),
                  ),
              stats.orphanCacheCount === 0
                ? null
                : h(
                    'span',
                    { className: 'dshsc-stat dshsc-statWarn' },
                    t('panel.stats.orphans', {
                      count: stats.orphanCacheCount,
                      size: formatBytes(stats.orphanCacheBytes) || '0 B',
                    }),
                  ),
              pending.length > 0 ? h('span', { className: 'dshsc-dockHint' }, t('panel.bulk.running')) : null,
            )

      const cacheAvailable = data?.orphanCache?.available !== false
      const cacheInfo = data?.orphanCache ?? { available: true, count: 0, bytes: 0 }
      const trashBatchList = data?.trash ?? []
      const trashCount = trashBatchList.reduce((sum, batch) => sum + batch.count, 0)
      const strayBytes = nav.stray.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0)
      const sessionView = currentView !== '__trash__' && currentView !== '__cache__'

      const toolbar = h(
        'div',
        { className: 'dshsc-toolbar' },
        h(
          'label',
          { className: 'dshsc-toolbarLabel' },
          h(TriCheck, {
            checked: allVisibleSelected,
            indeterminate: someVisibleSelected && !allVisibleSelected,
            disabled: visibleIds.length === 0 || pending.length > 0,
            label: t('panel.action.selectAll'),
            onChange: toggleAll,
          }),
          t('panel.action.selectAll'),
        ),
        h('input', {
          type: 'search',
          className: 'dshsc-search',
          placeholder: t('panel.search'),
          value: query,
          'aria-label': t('panel.search'),
          onChange: (event) => setQuery(event.currentTarget.value),
        }),
        h(
          'select',
          {
            className: 'dshsc-select',
            value: sort,
            'aria-label': t('panel.sort.label'),
            onChange: (event) => setSort(event.currentTarget.value),
          },
          h('option', { value: 'updated' }, t('panel.sort.updated')),
          h('option', { value: 'size' }, t('panel.sort.size')),
          h('option', { value: 'title' }, t('panel.sort.title')),
        ),
        selectedIds.length > 0
          ? h('span', { className: 'dshsc-pill' }, t('panel.bulk.selected', { count: selectedIds.length }))
          : null,
        h('span', { className: 'dshsc-spacer' }),
        loading ? h('span', { className: 'dshsc-dockHint' }, t('panel.loading')) : null,
      )

      const navRail = h(
        'nav',
        {
          className: 'dshsc-nav',
          role: 'tablist',
          'aria-label': t('panel.nav.workspaces'),
          onKeyDown: (event) => {
            const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
            if (direction === 0) return
            const ids = [
              ...nav.entries.map((entry) => entry.id),
              ...(nav.stray.length > 0 ? ['__ungrouped__'] : []),
              '__archived__',
              '__trash__',
              ...(cacheAvailable ? ['__cache__'] : []),
            ]
            const index = ids.indexOf(currentView)
            const next = ids[(index + direction + ids.length) % ids.length]
            if (next === undefined) return
            event.preventDefault()
            selectView(next)
          },
        },
        h('div', { className: 'dshsc-navSection' }, t('panel.nav.workspaces')),
        ...nav.entries.map((entry) =>
          h(NavItem, {
            key: entry.id,
            label: entry.name,
            meta: formatBytes(entry.bytes) || '0 B',
            count: entry.count,
            title: entry.path || entry.name,
            active: currentView === entry.id,
            muted: entry.count === 0,
            onClick: () => selectView(entry.id),
          }),
        ),
        nav.stray.length === 0
          ? null
          : h(NavItem, {
              key: '__ungrouped__',
              label: t('panel.ungrouped'),
              meta: formatBytes(strayBytes) || '0 B',
              count: nav.stray.length,
              active: currentView === '__ungrouped__',
              onClick: () => selectView('__ungrouped__'),
            }),
        h('div', { className: 'dshsc-navDivider', key: 'divider' }),
        h('div', { className: 'dshsc-navSection dshsc-navSectionGap', key: 'maintain' }, t('panel.nav.maintain')),
        h(NavItem, {
          key: '__archived__',
          label: t('panel.section.archived'),
          icon: 'archive',
          count: nav.archivedRows.length,
          active: currentView === '__archived__',
          onClick: () => selectView('__archived__'),
        }),
        h(NavItem, {
          key: '__trash__',
          label: t('panel.trash.title'),
          icon: 'trash',
          count: trashCount,
          warn: trashCount > 0,
          active: currentView === '__trash__',
          onClick: () => selectView('__trash__'),
        }),
        cacheAvailable
          ? h(NavItem, {
              key: '__cache__',
              label: t('panel.cache.title'),
              icon: 'cache',
              count: cacheInfo.count,
              warn: cacheInfo.count > 0,
              active: currentView === '__cache__',
              onClick: () => selectView('__cache__'),
            })
          : null,
      )

      const paneContent = []
      if (preview !== null) {
        paneContent.push(
          h(PreviewPane, {
            key: 'preview',
            row: sessionById.get(preview.id),
            state: preview,
            confirming,
            onBack: closePreview,
            archived: archivedSet.has(preview.id),
            onArchive,
            onUnarchive,
            onDelete,
            onConfirm,
            onCancel,
            t,
          }),
        )
      } else if (currentView === '__trash__') {
        paneContent.push(
          trashSection ??
            h(EmptyState, { key: 'empty-trash', icon: 'trash', title: t('panel.trash.empty') }),
        )
      } else if (currentView === '__cache__') {
        paneContent.push(
          cacheSection ??
            h(EmptyState, { key: 'empty-cache', icon: 'cache', title: t('panel.nav.emptyCache') }),
        )
      } else {
        for (const section of sections) paneContent.push(section)
        if (currentView === '__archived__' && orphanSection !== null) paneContent.push(orphanSection)
      }

      return h(
        'div',
        { className: 'dshsc-root' },
        h('style', { key: 'css' }, CSS),
        h(
          'div',
          { className: 'dshsc-head' },
          h(
            'div',
            { className: 'dshsc-headRow' },
            h('h1', { className: 'dshsc-h1' }, t('panel.title')),
            h('span', { className: 'dshsc-spacer' }),
            h(
              'button',
              { type: 'button', className: 'dshsc-btn dshsc-btnSm dshsc-btnGhost', onClick: () => load(), disabled: loading || pending.length > 0 },
              t('panel.refresh'),
            ),
          ),
          h(
            'div',
            { className: 'dshsc-metaRow' },
            h('p', { className: 'dshsc-sub' }, t('panel.subtitle')),
            statsRow,
          ),
        ),
        error === null
          ? null
          : h(
              'div',
              { className: 'dshsc-notice dshsc-noticeError' },
              t('panel.error', { message: error }),
              h('span', { className: 'dshsc-spacer' }),
              h('button', { type: 'button', className: 'dshsc-btn dshsc-btnSm', onClick: () => load() }, t('panel.retry')),
            ),
        notice === null
          ? null
          : h(
              'div',
              { className: 'dshsc-notice' + (notice.kind === 'error' ? ' dshsc-noticeError' : '') },
              notice.text,
            ),
        h(
          'div',
          { className: 'dshsc-split' },
          navRail,
          h(
            'div',
            { className: 'dshsc-pane' },
            sessionView && preview === null ? h('div', { className: 'dshsc-paneHead' }, toolbar) : null,
            h(
              'div',
              { className: 'dshsc-paneBody', role: 'tabpanel', 'aria-label': t('panel.title') },
              ...paneContent,
            ),
            sessionView ? dock : null,
            currentView === '__trash__' ? trashDock : null,
          ),
        ),
      )
    }

    /**
     * Sort rows by the selected order. Pins only float in the default
     * most-recent order; an explicit size or title sort is taken literally.
     * @param pinned - The registry-global pin set.
     * @param mode - updated | size | title.
     * @returns the comparator.
     */
    function byRowOrder(pinned, mode) {
      return (left, right) => {
        if (mode === 'size') return (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0)
        if (mode === 'title') {
          const leftTitle = (left.title || left.id).toLowerCase()
          const rightTitle = (right.title || right.id).toLowerCase()
          const order = leftTitle.localeCompare(rightTitle)
          if (order !== 0) return order
          return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
        }
        const leftPinned = pinned.has(left.id) ? 1 : 0
        const rightPinned = pinned.has(right.id) ? 1 : 0
        if (leftPinned !== rightPinned) return rightPinned - leftPinned
        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
      }
    }

    /**
     * Describe the first failed outcome of one action batch.
     * @param failed - Failed outcomes.
     * @returns the message text.
     */
    function firstFailure(failed) {
      const first = failed[0] ?? {}
      return first.reason ?? first.error ?? 'unknown'
    }

    /**
     * Activate the Client half: dictionaries, the main panel, the sidebar entry
     * that selects it, and the Session row's own delete action.
     * @param ctx - Client plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      /**
       * Ask the client Session store to re-read the Host list. Without this the
       * sidebar keeps a row for a Session whose log has already been moved away.
       */
      const refreshSessions = () => {
        try {
          const sessions = ctx.get('sessions')
          const pending = sessions?.refresh?.()
          if (pending !== undefined && typeof pending.then === 'function') pending.catch(() => {})
        } catch {}
      }
      ctx.effect(() => {
        const disposers = []
        for (const pair of [
          ['en', EN],
          ['zh', ZH],
        ]) {
          try {
            disposers.push(ctx.locale.register(NS, pair[0], pair[1]))
          } catch {}
        }
        disposers.push(
          ctx.slots.inject('main', () =>
            ctx.slots.register(
              { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t, refreshSessions }) },
              CleanupPage,
            ),
          ),
        )
        disposers.push(
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('panel.title'), locale: NS },
              CleanupIcon,
            ),
          ),
        )
        // The glyph the Session menu row borrows; `contextMenu.icon` hands the
        // component the action's icon descriptor, which this glyph ignores.
        disposers.push(
          ctx.slots.inject('contextMenu.icon', () =>
            ctx.slots.register({ name: 'contextMenu.icon', key: MENU_ICON_KEY }, MenuTrashIcon),
          ),
        )
        // The right-click / "..." menu on a Session row. Registered through the
        // data-driven menu service, so it inherits the built-in menu's styling and
        // dismissal instead of rendering a competing popover.
        //
        // `contextMenus` is provided by another plugin's boot, so it may not exist
        // yet when this one activates: retry briefly instead of losing the row for
        // the whole session, and never fail activation when it stays absent.
        let disposed = false
        let menuReady = false
        let retry = null
        let attempts = 0
        const registerMenu = () => {
          retry = null
          if (disposed || menuReady) return
          const menus = ctx.get('contextMenus')
          if (typeof menus?.register !== 'function') {
            attempts += 1
            if (attempts <= MAX_MENU_ATTEMPTS) retry = setTimeout(registerMenu, attempts <= 10 ? 200 : 1000)
            return
          }
          try {
            disposers.push(
              menus.register({
                id: 'session-cleanup.delete',
                target: 'session',
                order: 700,
                resolve: (target) => {
                  const sessionId = typeof target?.sessionId === 'string' ? target.sessionId : ''
                  if (sessionId === '') return []
                  return [
                    {
                      id: 'delete',
                      label: t('menu.delete'),
                      icon: { key: MENU_ICON_KEY },
                      danger: true,
                      separatorBefore: true,
                      // The footer block holds the destructive tail: built-in archive
                      // first (order 600), this delete last (order 700).
                      afterContent: true,
                      run: () => {
                        void deleteFromMenu(ctx, t, sessionId, target?.displayTitle)
                      },
                    },
                  ]
                },
              }),
            )
            menuReady = true
          } catch {}
        }
        registerMenu()
        return () => {
          disposed = true
          if (retry !== null) clearTimeout(retry)
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {}
          }
        }
      })
    }

    return { inject: ['slots', 'locale'], apply, name: NS }
  },
})
