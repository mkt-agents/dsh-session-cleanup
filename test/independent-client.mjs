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

const originalFetch=fetch;
let mode='normal';
globalThis.fetch=async(url,init)=>{
 const body=init?.body?JSON.parse(init.body):null;
 if(body&&mode==='mixed'&&body.op==='archive'){
  requests.push({url,init});return {ok:true,status:200,text:async()=>JSON.stringify({results:body.sessionIds.map(id=>id==='s2'?{ok:true}:id==='s1'?{ok:false,skipped:true,error:'session-in-use'}:{ok:false,error:'disk-error'}),state:hostState})};
 }
 if(body&&mode==='batchFailure'&&body.op==='restore'){
  requests.push({url,init});return {ok:true,status:200,text:async()=>JSON.stringify({results:[{ok:false,restored:1,failures:[{sessionId:'d2',error:'already-exists'}]}],restored:1,state:hostState})};
 }
 return originalFetch(url,init);
};
const posts=()=>requests.filter(x=>x.init?.body);
const click=async label=>{const b=find(tree,byText(label))[0];if(!b)throw new Error('button missing '+label);b.props.onClick();await settle();};
await clickNav('alpha');
find(tree,n=>n.props?.className==='dshsc-check'&&n.props?.['aria-label']==='Pinned small')[0].props.onChange();await settle();
find(tree,n=>n.props?.type==='search')[0].props.onChange({currentTarget:{value:'heavy'}});await settle();
check('filter explicitly warns about hidden selected item',textOf(tree).includes('另有 1 项已选'),textOf(tree));
await clickNav('beta');check('filtered hidden selection cleared on navigation',find(tree,n=>n.props?.className==='dshsc-dock').length===0);
await clickNav('alpha');find(tree,n=>n.props?.type==='search')[0].props.onChange({currentTarget:{value:''}});await settle();
hostState.sessions.push({id:'s6',title:'Fail cold',cwd:'D:\\demo\\alpha',sizeBytes:5,live:false});hostState.workspaces[0].sessionIds.push('s6');
// refresh supplies a new object reference and recomputes memoized rows
await click('刷新');
find(tree,n=>n.props?.className==='dshsc-check'&&n.props?.['aria-label']==='全选')[0].props.onChange();await settle();mode='mixed';await click('归档所选');
check('mixed notice counts success failure skip independently',/成功 1.*失败 1.*跳过 1/.test(textOf(tree)),textOf(tree));
check('mixed notice includes real failure detail',textOf(tree).includes('disk-error'),textOf(tree));
check('successful selection is removed',find(tree,n=>n.props?.['aria-label']==='Pinned small')[0]?.props.checked===false);
check('failed selection remains',find(tree,n=>n.props?.['aria-label']==='Fail cold')[0]?.props.checked===true);
check('skipped selection remains',find(tree,n=>n.props?.['aria-label']==='Heavy session')[0]?.props.checked===true);
mode='normal';await clickNav('孤立投影缓存');const before=posts().length;find(tree,byTextPrefix('删除这'))[0].props.onClick();await settle();
check('cache arm does not post',posts().length===before);
document.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){}});await settle();check('Escape cancels cache confirmation without post',posts().length===before&&find(tree,byText('确认清理')).length===0);
await clickNav('回收站');const beforePurge=posts().length;await click('清除');check('purge arm does not post',posts().length===beforePurge);await click('取消');check('purge cancellation does not post',posts().length===beforePurge);
mode='batchFailure';await click('还原');check('batch failure surfaces nested error reason',textOf(tree).includes('already-exists'),textOf(tree));check('partial restore feedback includes successful count',textOf(tree).includes('已还原 1'),textOf(tree));mode='normal';
const row=menuState.registration.resolve({kind:'session',sessionId:'expiry',displayTitle:'Expiry'})[0];const beforeMenu=posts().length;row.run();await new Promise(r=>setTimeout(r,10));check('menu click posts the delete immediately',posts().length===beforeMenu+1);
for(const row of results)console.log((row.ok?'PASS ':'FAIL ')+row.name+(row.ok?'':' '+JSON.stringify(row.detail)));
const failed=results.filter(x=>!x.ok);console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length}));process.exitCode=failed.length?1:0;