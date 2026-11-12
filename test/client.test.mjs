import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

let registration = null
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => {
      registration = entry
    },
  },
}

// Minimal hook runtime: enough to execute one component tree without a DOM.
const state = []
let cursor = 0
let scheduleRender = () => {}
const React = {
  createElement(type, props, ...children) {
    const flat = []
    const push = (child) => {
      if (Array.isArray(child)) child.forEach(push)
      else if (child !== null && child !== undefined && child !== false && child !== true) flat.push(child)
    }
    push(children)
    return { type, props: props ?? {}, children: flat }
  },
  useState(initial) {
    const index = cursor++
    if (state.length <= index) state[index] = typeof initial === 'function' ? initial() : initial
    return [
      state[index],
      (next) => {
        const value = typeof next === 'function' ? next(state[index]) : next
        if (value === state[index]) return
        state[index] = value
        scheduleRender()
      },
    ]
  },
  useEffect(fn, deps) {
    const index = cursor++
    const slot = state[index]
    if (slot === undefined || !sameDeps(slot.deps, deps)) {
      state[index] = { deps }
      Promise.resolve().then(fn)
    }
  },
  useRef(initial) {
    const index = cursor++
    if (state[index] === undefined) state[index] = { current: initial }
    return state[index]
  },
  useMemo(fn, deps) {
    const index = cursor++
    const slot = state[index]
    if (slot === undefined || !sameDeps(slot.deps, deps)) state[index] = { deps, value: fn() }
    return state[index].value
  },
  useCallback(fn, deps) {
    const index = cursor++
    const slot = state[index]
    if (slot === undefined || !sameDeps(slot.deps, deps)) state[index] = { deps, value: fn }
    return state[index].value
  },
}

/**
 * React's dependency comparison: same length and every entry Object.is-equal.
 * @param left - Previous dependency list.
 * @param right - Next dependency list.
 * @returns whether the memo may be reused.
 */
function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false
  }
  return true
}

const require = (name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
}

const requests = []
let menuFailure = null
const menuState = { registration: null, notifications: [], refreshed: 0 }
const hostState = {
  workspaces: [
    { workspaceId: 'ws-1', path: 'D:\\demo\\alpha', title: 'alpha', sessionIds: ['s1', 's2', 's3'] },
    { workspaceId: 'ws-2', path: 'D:\\demo\\beta', title: 'beta', sessionIds: ['s4'] },
  ],
  archivedSessionIds: ['s3', 'ghost-1'],
  pinnedSessionIds: ['s2'],
  sessions: [
    { id: 's1', title: 'Heavy session', updatedAt: 1794041000000, blank: false, running: true, live: true, cwd: 'D:\\demo\\alpha', origin: null, parentSessionId: null, sizeBytes: 12 * 1024 * 1024 },
    { id: 's2', title: 'Pinned small', updatedAt: 1794040000000, blank: false, running: false, live: false, cwd: 'D:\\demo\\alpha', origin: null, parentSessionId: null, sizeBytes: 2048 },
    { id: 's3', title: 'Archived one', updatedAt: 1794039000000, blank: false, running: false, live: false, cwd: 'D:\\demo\\alpha', origin: null, parentSessionId: null, sizeBytes: 4096 },
    { id: 's4', title: '', updatedAt: 1794038000000, blank: true, running: false, live: false, cwd: 'D:\\demo\\beta', origin: null, parentSessionId: 's1', sizeBytes: 0 },
    { id: 's5', title: 'Stray', updatedAt: 1794037000000, blank: false, running: false, live: false, cwd: '', origin: null, parentSessionId: null, sizeBytes: 1024 },
  ],
  trash: [
    {
      batch: 'session-cleanup-20261107-120000-000',
      createdAt: '2026-11-07T04:00:00.000Z',
      count: 2,
      bytes: 8192,
      items: [
        { sessionId: 'd1', cwdDir: '--D-demo-alpha--', title: 'Deleted A', size: 4096 },
        { sessionId: 'd2', cwdDir: '', title: '', size: 4096 },
      ],
    },
  ],
  orphanCache: { available: true, count: 131, bytes: 1625728 },
  stats: {
    sessionCount: 5,
    sessionsBytes: 12 * 1024 * 1024 + 7168,
    trashCount: 2,
    trashBatches: 1,
    trashBytes: 8192,
    orphanCacheCount: 131,
    orphanCacheBytes: 1625728,
  },
}

const previews = {
  s1: {
    sessionId: 's1',
    cwd: 'D:\\demo\\alpha',
    createdAt: 1794041000000,
    sizeBytes: 12 * 1024 * 1024,
    turnCount: 9,
    items: [
      { role: 'user', seq: 1, text: 'why is this session so large?' },
      { role: 'assistant', seq: 2, text: 'Because every tool result stays in the log.' },
    ],
    truncated: true,
  },
  s2: {
    sessionId: 's2',
    cwd: 'D:\\demo\\alpha',
    createdAt: 1794040000000,
    sizeBytes: 2048,
    turnCount: 1,
    items: [{ role: 'user', seq: 1, text: 'short one' }],
    truncated: false,
  },
}

globalThis.fetch = async (url, init) => {
  requests.push({ url, init })
  if (typeof url === 'string' && url.includes('/preview')) {
    const id = new URL(url, 'http://127.0.0.1:1').searchParams.get('id')
    const preview = previews[id]
    if (preview === undefined) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: 'session-not-found' }) }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(preview) }
  }
  const body = init?.body === undefined ? undefined : JSON.parse(init.body)
  if (body === undefined) {
    return { ok: true, status: 200, text: async () => JSON.stringify(hostState) }
  }
  const outcome =
    body.op === 'delete' && menuFailure !== null
      ? { ok: false, skipped: true, error: menuFailure }
      : { ok: true, restored: 2, purged: 1, removed: 131, freed: 1625728, pruned: 1 }
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        op: body.op,
        results: [outcome],
        pruned: 1,
        removed: 131,
        freed: 1625728,
        purged: 1,
        restored: 2,
        state: hostState,
      }),
  }
}

globalThis.document = { baseURI: 'http://127.0.0.1:1/' }

new Function(source)()
if (registration === null) throw new Error('client.js did not register a module')

const mod = registration.factory(require)
const registered = {}
const ctx = {
  locale: {
    bind: () => (key, vars) => {
      let text = (registered.dict ?? {})[key] ?? key
      for (const [name, value] of Object.entries(vars ?? {})) text = text.split('{' + name + '}').join(String(value))
      return text
    },
    register: (ns, locale, dict) => {
      if (locale === 'zh') registered.dict = dict
      return () => {}
    },
  },
  slots: {
    inject: (slot, fn) => {
      fn()
      return () => {}
    },
    register: (options, component) => {
      registered[options.name + ':' + (options.key ?? options.id)] = component
      return () => {}
    },
  },
  effect: (fn) => {
    fn()
  },
  get: (key) =>
    ({
      contextMenus: {
        register: (input) => {
          menuState.registration = input
          return () => {}
        },
        notify: (text, success) => {
          menuState.notifications.push({ text, success: success === true })
        },
      },
      sessions: {
        refresh: async () => {
          menuState.refreshed += 1
        },
        binding: () => undefined,
      },
    })[key],
}
mod.apply(ctx)

const Page = registered['main:session-cleanup']
const Icon = registered['sidebar.panellist:session-cleanup']

function expand(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { ...node, children: (node.children ?? []).map(expand) }
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (node.type === 'style') return ''
  return (node.children ?? []).map(textOf).join(' ')
}

function find(node, predicate, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) find(child, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  for (const child of node.children ?? []) find(child, predicate, out)
  return out
}

const byText = (label) => (node) => node.type === 'button' && textOf(node) === label
const byTextPrefix = (prefix) => (node) => node.type === 'button' && textOf(node).startsWith(prefix)

const results = []
const check = (name, condition, detail) => results.push({ name, ok: condition === true, detail })

let tree = null
let pending = false

const documentListeners = new Map()
if (typeof globalThis.document === 'undefined' || typeof globalThis.document.addEventListener !== 'function') {
  globalThis.document = {
    addEventListener(type, fn) {
      const list = documentListeners.get(type) ?? []
      list.push(fn)
      documentListeners.set(type, list)
    },
    removeEventListener(type, fn) {
      const list = documentListeners.get(type) ?? []
      documentListeners.set(type, list.filter((item) => item !== fn))
    },
    querySelector() {
      return null
    },
    dispatchEvent(event) {
      for (const fn of documentListeners.get(event.type) ?? []) fn(event)
      return true
    },
  }
}

async function renderOnce() {
  pending = false
  scheduleRender = () => {
    pending = true
  }
  cursor = 0
  tree = expand(
    Page({
      t: ctx.locale.bind('session-cleanup'),
      refreshSessions: () => {
        menuState.clientRefreshes = (menuState.clientRefreshes ?? 0) + 1
      },
    }),
  )
  for (let tick = 0; tick < 8; tick += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 2))
    if (pending) break
  }
  return tree
}

async function settle() {
  for (let round = 0; round < 20; round += 1) {
    await renderOnce()
    if (!pending) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (!pending) return tree
    }
  }
  return tree
}

if (typeof Page !== 'function') throw new Error('main panel not registered')
if (typeof Icon !== 'function') throw new Error('sidebar icon not registered')

await settle()
let text = textOf(tree)

/**
 * Find one rail entry by its visible label.
 * @param label - Exact nav label text.
 * @returns the nav button node, or undefined.
 */
function navItem(label) {
  const tabs = find(tree, (node) => node.props?.role === 'tab')
  return tabs.find((node) => {
    const main = (node.children ?? []).find((child) => child && child.props?.className === 'dshsc-navMain')
    if (main === undefined) return false
    const labelNode = (main.children ?? []).find((child) => child && child.props?.className === 'dshsc-navLabel')
    return labelNode !== undefined && textOf(labelNode) === label
  })
}

/**
 * Click one rail entry and let the panel settle.
 * @param label - Exact nav label text.
 */
async function clickNav(label) {
  const node = navItem(label)
  if (node === undefined) throw new Error('nav entry not found: ' + label)
  node.props.onClick()
  await settle()
}

/**
 * Read the pill count rendered inside one rail entry.
 * @param label - Exact nav label text.
 * @returns the count text, or undefined.
 */
function navCount(label) {
  const node = navItem(label)
  if (node === undefined) return undefined
  const pill = (node.children ?? []).find((child) => child && child.props?.className === 'dshsc-pill')
  return pill === undefined ? undefined : textOf(pill)
}

check('renders title', text.includes('会话清理'), text.slice(0, 80))
check('state fetched', requests.some((entry) => entry.url.endsWith('/dsh-session-cleanup/state')))
check('stats show size', /12(\.\d+)? MB/.test(text), text.slice(0, 300))
check('split layout present', find(tree, (node) => node.props?.className === 'dshsc-split').length === 1)
check('left rail present', find(tree, (node) => node.props?.className === 'dshsc-nav').length === 1)
check('right pane present', find(tree, (node) => node.props?.className === 'dshsc-pane').length === 1)
check('rail lists workspaces', navItem('alpha') !== undefined && navItem('beta') !== undefined)
check('rail lists archived and trash', navItem('已归档') !== undefined && navItem('回收站') !== undefined)
check('rail lists orphan cache', navItem('孤立投影缓存') !== undefined)
check('rail has no aggregate entry', navItem('全部会话') === undefined)
check('default view opens first populated workspace', navItem('alpha')?.props['aria-current'] === true)
check('rail counts workspace sessions', navCount('alpha') === '2' && navCount('beta') === '1', [navCount('alpha'), navCount('beta')])
check('rail counts archived', navCount('已归档') === '1', navCount('已归档'))
check('rail counts trash', navCount('回收站') === '2', navCount('回收站'))
check('search input rendered', find(tree, (node) => node.props?.type === 'search').length === 1)
check('sort select rendered', find(tree, (node) => node.props?.className === 'dshsc-select').length === 1)
check('live badge', text.includes('运行中'))
check('pinned badge', text.includes('已置顶'))
check('search placeholder', find(tree, (node) => node.props?.placeholder === '搜索标题、ID 或路径').length === 1)
check('meta row merges subtitle and stats', find(tree, (node) => node.props?.className === 'dshsc-metaRow').length === 1)
check('size column rendered per row', find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('dshsc-sizeCell')).length >= 2)
check('head drops count text', find(tree, (node) => node.props?.className === 'dshsc-countText').length === 0)
check('head carries size and length', find(tree, (node) => node.props?.className === 'dshsc-headStats').length === 1 && text.includes('2 个会话'), text.slice(0, 600))
check('head drops path chip', find(tree, (node) => node.props?.className === 'dshsc-cardPath').length === 0)
check('default view hides archived rows', !text.includes('Archived one'), text.slice(0, 400))
check('default view hides other workspaces', !text.includes('Stray'), text.slice(0, 400))
check('no raw locale keys in workspace view', !/panel\.[a-zA-Z]/.test(text), text.slice(0, 400))

const rowCount = find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('dshsc-row')).length
check('row count sane', rowCount === 2, rowCount)

// Workspace switch narrows the pane to that workspace only.
await clickNav('beta')
text = textOf(tree)
check('workspace switch activates entry', navItem('beta')?.props['aria-current'] === true)
check('workspace switch drops other workspaces', !text.includes('Heavy session') && !text.includes('Stray'), text.slice(0, 300))
check('workspace switch deactivates previous entry', navItem('alpha')?.props['aria-current'] === false)
check('subagent badge', text.includes('子会话'), text.slice(0, 300))

// Archived view shows archived rows and the stale-archive cleanup card.
await clickNav('已归档')
text = textOf(tree)
check('archived view shows archived row', text.includes('Archived one'), text.slice(0, 300))
check('archived view offers restore', find(tree, byText('恢复')).length === 1)
check('archived view shows stale-archive card', text.includes('清理这 1 条'), text.slice(0, 600))
check('no raw locale keys in archived view', !/panel\.[a-zA-Z]/.test(text), text.slice(0, 400))
check('archived head is a slim stats bar', find(tree, (node) => node.props?.className === 'dshsc-headStats').length === 1 && find(tree, (node) => node.props?.className === 'dshsc-cardPath').length === 0)
const archivedTitle = find(tree, (node) => node.props?.className === 'dshsc-main' && textOf(node).includes('Archived one'))[0]
check('archived row opens preview', archivedTitle !== undefined)
archivedTitle.props.onClick()
await settle()
text = textOf(tree)
check('archived preview offers unarchive', find(tree, byText('恢复')).length >= 1, text.slice(0, 400))
check('archived preview hides the archive action', find(tree, byText('归档')).length === 0, text.slice(0, 400))
const unarchiveButton = find(tree, byText('恢复'))[0]
unarchiveButton.props.onClick()
await settle()
check('archived preview posts unarchive', requests.some((entry) => entry.init?.body?.includes('"op":"unarchive"') && entry.init.body.includes('"s3"')))
find(tree, byText('返回'))[0]?.props?.onClick?.()
await settle()

await clickNav('alpha')
text = textOf(tree)
const searchNode = find(tree, (node) => node.props?.type === 'search')[0]
searchNode.props.onChange({ currentTarget: { value: 'heavy' } })
await settle()
text = textOf(tree)
check('filter narrows to one match', text.includes('Heavy session') && !text.includes('Pinned small'), text.slice(0, 200))

const searchAgain = find(tree, (node) => node.props?.type === 'search')[0]
searchAgain.props.onChange({ currentTarget: { value: '' } })
await settle()
const selectNode = find(tree, (node) => node.props?.className === 'dshsc-select')[0]
selectNode.props.onChange({ currentTarget: { value: 'size' } })
await settle()
const titles = find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.startsWith('dshsc-title'))
check('size sort puts heavy first', textOf(titles[0]).includes('Heavy session'), titles.slice(0, 3).map(textOf))

const groupChecks = find(tree, (node) => node.props?.['aria-label'] === '选择该分组内的会话')
check('card head has no select-all', groupChecks.length === 0, groupChecks.length)
const selectAllBox = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选')[0]
check('toolbar select-all present', selectAllBox !== undefined)
selectAllBox.props.onChange()
await settle()
text = textOf(tree)
check('dock appears with selection', text.includes('已选'), text.slice(-300))
check('dock archive action', text.includes('归档所选'))

await clickNav('beta')
text = textOf(tree)
check(
  'switching workspace clears hidden selection',
  find(tree, (node) => node.props?.className === 'dshsc-dock').length === 0,
  text.slice(-300),
)
await clickNav('alpha')
text = textOf(tree)
check(
  'selection stays cleared after returning to the workspace',
  find(tree, (node) => node.props?.className === 'dshsc-dock').length === 0,
  text.slice(-300),
)
const selectAllAgain = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选')[0]
check('select-all still present after a view switch', selectAllAgain !== undefined)
selectAllAgain.props.onChange()
await settle()
text = textOf(tree)
check('selection can be restored after a view switch', text.includes('已选'))

const clearButton = find(tree, byText('清空选择'))[0]
check('clear button present', clearButton !== undefined)
clearButton.props.onClick()
await settle()

const rowChecks = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Pinned small')
check('row checkbox for cold session', rowChecks.length === 1, rowChecks.length)
rowChecks[0].props.onChange()
await settle()

const deleteButton = find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('dshsc-btnSolidDanger'))[0]
check('delete button present', deleteButton !== undefined)
check('delete button enabled for cold selection', deleteButton?.props.disabled === false, deleteButton?.props.disabled)
deleteButton.props.onClick()
await settle()
text = textOf(tree)
check('bulk confirm text shown', text.includes('移入回收站'), text.slice(-300))
const confirmButton = find(tree, byText('确认删除'))[0]
check('bulk confirm button', confirmButton !== undefined)
confirmButton.props.onClick()
await settle()

const deleteRequest = requests.find((entry) => entry.init?.body?.includes('"op":"delete"'))
check('delete posted', deleteRequest !== undefined, requests.map((entry) => entry.init?.body).filter(Boolean))
check('delete carried labels', deleteRequest !== undefined && deleteRequest.init.body.includes('"labels":{"s2":"Pinned small"}'), deleteRequest?.init?.body)

// Recycle bin owns its own pane.
await clickNav('回收站')
text = textOf(tree)
check('trash pane lists batch items', text.includes('Deleted A'), text.slice(0, 300))
check('no raw locale keys in trash view', !/panel\.[a-zA-Z]/.test(text), text.slice(0, 400))
check('trash head shows time instead of folder name', !text.includes('session-cleanup-2026'), text.slice(0, 300))
check('trash pane hides the session toolbar', find(tree, (node) => node.props?.className === 'dshsc-paneHead').length === 0)

const purgeButtons = find(tree, byText('清除'))
check('per-item purge button', purgeButtons.length === 2, purgeButtons.length)
purgeButtons[0].props.onClick()
await settle()
text = textOf(tree)
check('item purge confirm text', text.includes('确定彻底清除这一项'), text.slice(-300))
const itemConfirm = find(tree, byText('确认删除'))[0]
itemConfirm.props.onClick()
await settle()
check('item purge posted', requests.some((entry) => entry.init?.body?.includes('"op":"purge"') && entry.init.body.includes('"d1"')))

const restoreButtons = find(tree, byText('还原'))
check('per-item restore button', restoreButtons.length === 2, restoreButtons.length)
restoreButtons[0].props.onClick()
await settle()
const restoreRequest = requests.find((entry) => entry.init?.body?.includes('"op":"restore"'))
check('per-item restore posted', restoreRequest !== undefined, restoreRequest?.init?.body)
check('restore scoped to one session', restoreRequest !== undefined && restoreRequest.init.body.includes('"sessionIds":["d1"]'), restoreRequest?.init?.body)

// Orphan cache has its own pane too.
await clickNav('孤立投影缓存')
const cacheButton = find(tree, byTextPrefix('删除这'))
check('orphan cache button', cacheButton.length === 1, cacheButton.length)
cacheButton[0].props.onClick()
await settle()
text = textOf(tree)
check('orphan cache confirms first', text.includes('无法撤销') || text.includes('确认清理'), text.slice(-400))
check('orphan cache did not post on first click', !requests.some((entry) => entry.init?.body?.includes('pruneOrphanCache')))
const cacheConfirm = find(tree, byText('确认清理'))[0]
check('orphan cache confirm button', cacheConfirm !== undefined)
cacheConfirm.props.onClick()
await settle()
check('orphan cache posted', requests.some((entry) => entry.init?.body?.includes('pruneOrphanCache')))
text = textOf(tree)
check('freed notice shown', text.includes('已删除') && /1\.\d+ MB/.test(text), text.slice(-300))

// Session row context menu: the same reversible delete, offered from the sidebar.
check('menu registered for the session target', menuState.registration?.target === 'session')
check('menu icon registered under own key', registered['contextMenu.icon:session-cleanup.delete'] !== undefined)
const menuRows = menuState.registration.resolve({ kind: 'session', sessionId: 's9', displayTitle: 'Menu target' })
check('menu offers exactly one row', menuRows.length === 1, menuRows)
check(
  'menu row is a separated danger footer action',
  menuRows[0]?.danger === true && menuRows[0]?.separatorBefore === true && menuRows[0]?.afterContent === true,
)
check('menu row label', menuRows[0]?.label === '删除会话', menuRows[0]?.label)
const refreshedBeforeMenu = menuState.refreshed
const requestsBeforeMenu = requests.length
menuRows[0].run()
await new Promise((resolve) => setTimeout(resolve, 25))
const menuDelete = requests.filter((entry) => entry.init?.body?.includes('"sessionIds":["s9"]')).pop()
check('menu delete posts on the first click', menuDelete !== undefined, requests.map((entry) => entry.init?.body).filter(Boolean).slice(-3))
check('menu delete carries the title', menuDelete?.init?.body.includes('"s9":"Menu target"'), menuDelete?.init?.body)
check('menu success notice', menuState.notifications.some((n) => n.success === true && n.text === '已移入回收站。'))
check('menu refreshes the sidebar list', menuState.refreshed > refreshedBeforeMenu, menuState.refreshed)

// A live Session is refused by the Host; the menu must say why and leave the list alone.
menuFailure = 'session-in-use'
const refusedRows = menuState.registration.resolve({ kind: 'session', sessionId: 's10', displayTitle: 'Open one' })
const refreshedBeforeRefusal = menuState.refreshed
refusedRows[0].run()
await new Promise((resolve) => setTimeout(resolve, 25))
check(
  'menu reports the in-use refusal',
  menuState.notifications.some((n) => n.success === false && n.text.includes('正在使用中')),
  menuState.notifications.slice(-2),
)
check('menu keeps the list after a refusal', menuState.refreshed === refreshedBeforeRefusal, menuState.refreshed)
menuFailure = null

// Session preview: the row title opens the stored transcript instead of selecting.
await clickNav('alpha')
const heavyRow = find(tree, (node) => node.props?.className === 'dshsc-main' && textOf(node).includes('Heavy session'))[0]
check('row title is the preview trigger', heavyRow !== undefined)
heavyRow.props.onClick()
await settle()
text = textOf(tree)
check('preview shows the transcript', text.includes('why is this session so large?'), text.slice(0, 300))
check('preview labels the roles', text.includes('你') && text.includes('助手'), text.slice(0, 300))
check('preview marks truncation', text.includes('只显示最近 2 条消息'), text.slice(0, 600))
check('preview shows the turn count', text.includes('9 轮对话'), text.slice(0, 600))
check('preview hides the list toolbar', find(tree, (node) => node.props?.className === 'dshsc-paneHead').length === 0)
check('preview offers a way back', find(tree, byText('返回')).length === 1)
document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} })
await settle()
check('escape closes the preview', find(tree, byText('返回')).length === 0)
// Re-open so later preview tests still have a transcript to go back from.
heavyRow.props.onClick()
await settle()
check('preview reopened after escape', find(tree, byText('返回')).length === 1)

find(tree, byText('返回'))[0].props.onClick()
await settle()
check('back returns to the list', find(tree, (node) => node.props?.className === 'dshsc-paneHead').length === 1)

// Deleting from the preview keeps the two-step confirmation and closes the view.
const coldRow = find(tree, (node) => node.props?.className === 'dshsc-main' && textOf(node).includes('Pinned small'))[0]
coldRow.props.onClick()
await settle()
check('preview opens for a cold session', textOf(tree).includes('short one'), textOf(tree).slice(0, 200))
const refreshesBefore = menuState.clientRefreshes ?? 0
find(tree, byText('删除'))[0].props.onClick()
await settle()
check('preview delete arms confirmation', textOf(tree).includes('确认删除'), textOf(tree).slice(0, 200))
find(tree, byText('确认删除'))[0].props.onClick()
await settle()
const previewDelete = requests.filter((entry) => entry.init?.body?.includes('"sessionIds":["s2"]')).pop()
check('preview delete posted', previewDelete !== undefined, previewDelete?.init?.body)
check('preview closes after delete', find(tree, byText('返回')).length === 0)
check(
  'panel refreshes the client session list',
  (menuState.clientRefreshes ?? 0) > refreshesBefore,
  [refreshesBefore, menuState.clientRefreshes],
)

// The rail must drive the pane: opening a preview and then switching workspace
// closes the preview instead of leaving a stale transcript on screen.
const alphaRow = find(tree, (node) => node.props?.className === 'dshsc-main' && textOf(node).includes('Heavy session'))[0]
alphaRow.props.onClick()
await settle()
check('preview reopened for the rail switch test', find(tree, byText('返回')).length === 1)
await clickNav('beta')
check('workspace switch closes the preview', find(tree, byText('返回')).length === 0, textOf(tree).slice(-200))
check('workspace switch shows the new list', textOf(tree).includes('未命名会话') || textOf(tree).includes('s4'), textOf(tree).slice(-300))
check('workspace switch keeps the rail selection', navItem('beta')?.props['aria-current'] === true)
await clickNav('回收站')
check('trash switch closes the preview', find(tree, byText('返回')).length === 0)


// Targeted R4: batch partial-failure notices keep the success count and nested reasons.
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null
  if (body && body.op === 'restore') {
    requests.push({ url, init })
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [{ ok: false, restored: 1, failures: [{ sessionId: 'd2', error: 'already-exists' }] }],
          restored: 1,
          state: hostState,
        }),
    }
  }
  return originalFetch(url, init)
}
await clickNav('回收站')
const r4Restore = find(tree, byText('还原'))[0]
r4Restore.props.onClick()
await settle()
text = textOf(tree)
check('R4 partial restore surfaces nested error reason', text.includes('already-exists'), text.slice(-400))
check('R4 partial restore keeps the successful count', text.includes('已还原 1'), text.slice(-400))
globalThis.fetch = originalFetch


// Recycle-bin checkbox selection (new feature; distinct from R1-R5).
// The bulk dock follows the session view's interaction: it only exists once
// something is checked, instead of idling with disabled buttons.
check(
  'trash bulk dock is hidden when nothing is checked',
  find(tree, byText('还原所选'))[0] === undefined && find(tree, byText('永久删除所选'))[0] === undefined,
)
check('empty recycle bin remains independent', find(tree, byText('清空回收站')).length === 1)
check('legacy batch-wide restore all is gone', find(tree, byText('整批还原')).length === 0)
check('legacy batch-wide purge all is gone', find(tree, byText('整批清除')).length === 0)
const batchSelect = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选该批次')[0]
check('batch select-all checkbox is present', batchSelect !== undefined)
const itemCheckA = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]
check('per-item trash checkbox is present', itemCheckA !== undefined)
itemCheckA.props.onChange()
await settle()
check('checking one item enables selected actions', find(tree, byText('还原所选'))[0]?.props.disabled === false)
check('checking one item shows the selected count', textOf(tree).includes('已选 1'), textOf(tree).slice(-400))
const mixedBatch = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选该批次')[0]
check(
  'batch select-all is indeterminate after a partial selection',
  mixedBatch?.props['aria-checked'] === 'mixed' && mixedBatch?.props['data-indeterminate'] === 'true',
  mixedBatch?.props,
)
find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0].props.onChange()
await settle()
check(
  'clearing the last item hides the bulk dock again',
  find(tree, byText('还原所选'))[0] === undefined && find(tree, byText('永久删除所选'))[0] === undefined,
)
find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选该批次')[0].props.onChange()
await settle()
check(
  'batch select-all checks every session in the batch',
  find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]?.props.checked === true &&
    find(tree, (node) => node.props?.className === 'dshsc-check' && String(node.props?.['aria-label'] ?? '').includes('d2'))[0]?.props.checked === true,
)
check('batch select-all shows the batch count', textOf(tree).includes('已选 2'), textOf(tree).slice(-400))
const firstBatch = hostState.trash[0]
hostState.trash = [
  {
    ...firstBatch,
    count: firstBatch.items.length + 1,
    items: [
      ...firstBatch.items,
      { sessionId: 'd-ghost', cwdDir: '', title: 'Ghost New', size: 1 },
    ],
  },
]
find(tree, byText('刷新'))[0].props.onClick()
await settle()
check(
  'a newly appeared batch item stays unselected after a prior select-all',
  find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Ghost New')[0]?.props.checked !== true &&
    find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]?.props.checked === true &&
    find(tree, (node) => node.props?.className === 'dshsc-check' && String(node.props?.['aria-label'] ?? '').includes('d2'))[0]?.props.checked === true,
)
check('select-all count does not absorb the unselected new item', textOf(tree).includes('已选 2') && !textOf(tree).includes('已选 3'), textOf(tree).slice(-400))
const beforeWhole = requests.length
find(tree, byText('还原所选'))[0].props.onClick()
await settle()
const wholeRestore = requests.slice(beforeWhole).find((entry) => entry.init?.body?.includes('"op":"restore"'))
const wholeBody = wholeRestore === undefined ? {} : JSON.parse(wholeRestore.init.body)
check(
  'batch select-all restore posts explicit selected ids',
  wholeRestore !== undefined &&
    wholeBody.batch === 'session-cleanup-20261107-120000-000' &&
    Array.isArray(wholeBody.sessionIds) &&
    [...wholeBody.sessionIds].sort().join(',') === 'd1,d2',
  wholeRestore?.init?.body,
)
check(
  'batch select-all restore omits the unselected newly appeared item',
  wholeRestore !== undefined && !String(wholeRestore.init.body).includes('d-ghost'),
  wholeRestore?.init?.body,
)
check('successful batch restore hides the bulk dock', find(tree, byText('还原所选'))[0] === undefined)

find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0].props.onChange()
await settle()
const beforeOne = requests.length
find(tree, byText('还原所选'))[0].props.onClick()
await settle()
const oneRestore = requests.slice(beforeOne).find((entry) => entry.init?.body?.includes('"op":"restore"'))
check(
  'partial restore posts only the checked session',
  oneRestore !== undefined && oneRestore.init.body.includes('"sessionIds":["d1"]'),
  oneRestore?.init?.body,
)

find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0].props.onChange()
await settle()
const beforePurgeArm = requests.filter((entry) => entry.init?.body).length
find(tree, byText('永久删除所选'))[0].props.onClick()
await settle()
check(
  'selected purge arms confirmation without posting',
  requests.filter((entry) => entry.init?.body).length === beforePurgeArm && textOf(tree).includes('无法恢复') && textOf(tree).includes('1'),
  textOf(tree).slice(-400),
)
find(tree, byText('取消'))[0].props.onClick()
await settle()
check(
  'cancelling selected purge posts nothing',
  requests.filter((entry) => entry.init?.body).length === beforePurgeArm && find(tree, byText('永久删除所选')).length === 1,
)
find(tree, byText('永久删除所选'))[0].props.onClick()
await settle()
const d2Box = find(tree, (node) => node.props?.className === 'dshsc-check' && String(node.props?.['aria-label'] ?? '').includes('d2'))[0]
d2Box.props.onChange()
await settle()
check(
  'changing the selection while purge is armed cancels confirmation',
  find(tree, byText('永久删除所选')).length === 1 && find(tree, byText('确认删除')).length === 0 &&
    requests.filter((entry) => entry.init?.body).length === beforePurgeArm,
  textOf(tree).slice(-400),
)
d2Box.props.onChange()
await settle()
find(tree, byText('永久删除所选'))[0].props.onClick()
await settle()
hostState.trash = hostState.trash.map((batch) =>
  batch.batch !== 'session-cleanup-20261107-120000-000'
    ? batch
    : {
        ...batch,
        count: (batch.items ?? []).length + 1,
        items: [...(batch.items ?? []), { sessionId: 'd-ghost2', cwdDir: '', title: 'Ghost Two', size: 1 }],
      },
)
find(tree, byText('刷新'))[0].props.onClick()
await settle()
check(
  'an unselected item appearing during confirmation does not change the confirmed count',
  find(tree, byText('确认删除')).length === 1 && textOf(tree).includes('无法恢复') && textOf(tree).includes('所选的 1 个会话'),
  textOf(tree).slice(-400),
)
check(
  'the newly appeared item is not checked during confirmation',
  find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Ghost Two')[0]?.props.checked !== true,
)
const beforePurge = requests.length
find(tree, byText('确认删除'))[0].props.onClick()
await settle()
const selectedPurge = requests.slice(beforePurge).find((entry) => entry.init?.body?.includes('"op":"purge"'))
const purgeBody = selectedPurge === undefined ? {} : JSON.parse(selectedPurge.init.body)
check(
  'confirming selected purge posts only the frozen session ids',
  selectedPurge !== undefined &&
    Array.isArray(purgeBody.sessionIds) &&
    purgeBody.sessionIds.join(',') === 'd1' &&
    !String(selectedPurge.init.body).includes('d-ghost2') &&
    !String(selectedPurge.init.body).includes('"d2"'),
  selectedPurge?.init?.body,
)

const fetchAfterUi = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null
  if (body && body.op === 'restore') {
    requests.push({ url, init })
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [{ ok: false, restored: 1, failures: [{ sessionId: 'd2', error: 'already-exists' }] }],
          restored: 1,
          state: hostState,
        }),
    }
  }
  return fetchAfterUi(url, init)
}
find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === '全选该批次')[0].props.onChange()
await settle()
find(tree, byText('还原所选'))[0].props.onClick()
await settle()
check('selected restore partial failure keeps the success count', textOf(tree).includes('已还原 1'), textOf(tree).slice(-400))
check('selected restore partial failure surfaces the host conflict', textOf(tree).includes('already-exists'), textOf(tree).slice(-400))
check(
  'successful trash selection is cleared after a partial restore',
  find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]?.props.checked === false,
)
check(
  'failed trash selection remains for retry',
  find(tree, (node) => node.props?.className === 'dshsc-check' && String(node.props?.['aria-label'] ?? '').includes('d2'))[0]?.props.checked === true,
)
globalThis.fetch = fetchAfterUi

hostState.trash = [
  ...hostState.trash,
  {
    batch: 'session-cleanup-20261108-120000-000',
    createdAt: '2026-11-08T04:00:00.000Z',
    count: 1,
    bytes: 1024,
    items: [{ sessionId: 'd1', cwdDir: '--D-demo-beta--', title: 'Other A', size: 1024 }],
  },
]
find(tree, byText('刷新'))[0].props.onClick()
await settle()
const leftoverFailed = find(tree, (node) => node.props?.className === 'dshsc-check' && String(node.props?.['aria-label'] ?? '').includes('d2'))[0]
if (leftoverFailed?.props.checked === true) {
  leftoverFailed.props.onChange()
  await settle()
}
const otherA = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Other A')[0]
const firstA = find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]
check('cross-batch rows with the same sessionId stay distinct', otherA !== undefined && firstA !== undefined)
otherA.props.onChange()
await settle()
check(
  'checking one d1 does not select the other batch',
  find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]?.props.checked !== true &&
    find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Other A')[0]?.props.checked === true,
)
const beforeCross = requests.length
find(tree, byText('还原所选'))[0].props.onClick()
await settle()
const crossRestore = requests.slice(beforeCross).find((entry) => entry.init?.body?.includes('"op":"restore"'))
check(
  'cross-batch restore only posts the checked batch',
  crossRestore !== undefined &&
    crossRestore.init.body.includes('session-cleanup-20261108-120000-000') &&
    !crossRestore.init.body.includes('session-cleanup-20261107-120000-000'),
  crossRestore?.init?.body,
)

find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0].props.onChange()
await settle()
check('selection can be armed before a view switch', find(tree, byText('还原所选'))[0]?.props.disabled === false)
await clickNav('alpha')
await clickNav('回收站')
check(
  'switching views clears the trash selection',
  find(tree, byText('还原所选'))[0] === undefined &&
    find(tree, (node) => node.props?.className === 'dshsc-check' && node.props?.['aria-label'] === 'Deleted A')[0]?.props.checked !== true,
)

const summary = results.map((row) => `${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.ok ? '' : '  -> ' + JSON.stringify(row.detail)}`)
console.log(summary.join('\n'))
const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
