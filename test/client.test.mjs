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

globalThis.fetch = async (url, init) => {
  requests.push({ url, init })
  const body = init?.body === undefined ? undefined : JSON.parse(init.body)
  if (body === undefined) {
    return { ok: true, status: 200, text: async () => JSON.stringify(hostState) }
  }
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        op: body.op,
        results: [{ ok: true, restored: 2, purged: 1, removed: 131, freed: 1625728, pruned: 1 }],
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

async function renderOnce() {
  pending = false
  scheduleRender = () => {
    pending = true
  }
  cursor = 0
  tree = expand(Page({ t: ctx.locale.bind('session-cleanup') }))
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
check('compact head shows count text', find(tree, (node) => node.props?.className === 'dshsc-countText').length === 1)
check('compact head drops path chip', find(tree, (node) => node.props?.className === 'dshsc-cardPath').length === 0)
check('default view hides archived rows', !text.includes('Archived one'), text.slice(0, 400))
check('default view hides other workspaces', !text.includes('Stray'), text.slice(0, 400))

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
check('archived head keeps path slot', find(tree, (node) => node.props?.className === 'dshsc-cardPath').length === 1)

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
check('group checkbox present', groupChecks.length >= 1, groupChecks.length)
groupChecks[0].props.onChange()
await settle()
text = textOf(tree)
check('dock appears with selection', text.includes('已选'), text.slice(-300))
check('dock archive action', text.includes('归档所选'))

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
check('orphan cache posted', requests.some((entry) => entry.init?.body?.includes('pruneOrphanCache')))
text = textOf(tree)
check('freed notice shown', text.includes('已删除') && /1\.\d+ MB/.test(text), text.slice(-300))

const summary = results.map((row) => `${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.ok ? '' : '  -> ' + JSON.stringify(row.detail)}`)
console.log(summary.join('\n'))
const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
