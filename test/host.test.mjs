import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const pluginPath = fileURLToPath(new URL('../index.js', import.meta.url))
const home = await mkdtemp(path.join(tmpdir(), 'dshsc-'))
process.env.DSH_HOME = home

const group = '--D-demo-project--'
const liveId = 'session-live-0000'
const coldId = 'session-cold-0000'
const orphanOld = 'session-gone-old0'
const orphanFresh = 'session-gone-new0'

await mkdir(path.join(home, 'sessions', group, liveId), { recursive: true })
await mkdir(path.join(home, 'sessions', group, coldId), { recursive: true })
await writeFile(path.join(home, 'sessions', group, liveId, 'session.v4.jsonl.zstd'), Buffer.alloc(4096, 1))
await writeFile(path.join(home, 'sessions', group, coldId, 'session.v4.jsonl.zstd'), Buffer.alloc(2048, 2))

const cacheDir = path.join(home, 'storages', 'session_projcache', 'sessions')
await mkdir(cacheDir, { recursive: true })
await writeFile(path.join(cacheDir, liveId + '.json'), '{}')
await writeFile(path.join(cacheDir, coldId + '.json'), '{}')
await writeFile(path.join(cacheDir, orphanOld + '.json'), '{}')
await writeFile(path.join(cacheDir, orphanFresh + '.json'), '{}')
const old = new Date(Date.now() - 3 * 60 * 60 * 1000)
await (await import('node:fs/promises')).utimes(path.join(cacheDir, orphanOld + '.json'), old, old)

const liveSession = {
  header: { id: liveId },
  sizeBytes: 4096,
  location: { kind: 'file', path: path.join(home, 'sessions', group, liveId, 'session.v4.jsonl.zstd') },
}
const coldSession = {
  header: { id: coldId },
  sizeBytes: 2048,
  location: { kind: 'file', path: path.join(home, 'sessions', group, coldId, 'session.v4.jsonl.zstd') },
}

const registry = {
  archivedSessionIds: ['session-ghost-0000', liveId],
  pinnedSessionIds: ['session-ghost-0000'],
  list: () => [
    { id: 'ws-1', path: 'D:/demo/project', title: 'demo', sessionIds: [liveId, coldId] },
  ],
  archiveSession: async () => {},
  unarchiveSession: async (id) => {
    registry.archivedSessionIds = registry.archivedSessionIds.filter((entry) => entry !== id)
  },
  unpinSession: async (id) => {
    registry.pinnedSessionIds = registry.pinnedSessionIds.filter((entry) => entry !== id)
  },
}

const services = {
  webServer: { register: () => () => {} },
  workspaceRegistry: registry,
  sessions: { get: (id) => (id === liveId ? { id } : undefined) },
  agents: { get: () => undefined },
  sessionPersistence: {
    list: async () => [liveSession, coldSession],
  },
  sessionController: {
    list: async () => ({
      items: [
        {
          sessionId: liveId,
          updatedAt: Date.now(),
          blank: false,
          running: true,
          agentAvailable: true,
          cwd: 'D:/demo/project',
          projections: { values: { title: 'Live session' } },
        },
        {
          sessionId: coldId,
          updatedAt: Date.now() - 86_400_000,
          blank: false,
          running: false,
          agentAvailable: false,
          cwd: 'D:/demo/project',
          projections: { values: { title: 'Cold session' } },
        },
      ],
    }),
  },
}

const routes = new Map()
const ctx = {
  effect: (fn) => {
    fn()
  },
  get: (key) => services[key],
  webServer: {
    register: (route) => {
      routes.set(route.path, route.handler)
      return () => {}
    },
  },
}

const mod = await import(pathToFileURL(pluginPath).href)
mod.apply(ctx)

function fakeResponse() {
  const state = { status: 0, body: '', headers: {} }
  return {
    state,
    writeHead(status, headers) {
      state.status = status
      state.headers = headers ?? {}
    },
    end(text) {
      state.body = text ?? ''
    },
  }
}

async function callState() {
  const handler = routes.get('/dsh-session-cleanup/state')
  const res = fakeResponse()
  await handler({ method: 'GET', headers: { host: '127.0.0.1:1' } }, res)
  return { status: res.state.status, data: JSON.parse(res.state.body) }
}

async function callAction(body) {
  const handler = routes.get('/dsh-session-cleanup/action')
  const res = fakeResponse()
  const request = (async function* () {
    yield Buffer.from(JSON.stringify(body), 'utf8')
  })()
  request.method = 'POST'
  request.headers = { host: '127.0.0.1:1', 'content-type': 'application/json' }
  await handler(request, res)
  return { status: res.state.status, data: JSON.parse(res.state.body) }
}

const results = []
const check = (name, condition, detail) => {
  results.push({ name, ok: condition === true, detail })
}

const state = await callState()
check('state 200', state.status === 200, state.status)
check('rows', state.data.sessions.length === 2, state.data.sessions.length)
check('size from snapshot', state.data.sessions.find((row) => row.id === liveId)?.sizeBytes === 4096)
check('stats sessions bytes', state.data.stats.sessionsBytes === 6144, state.data.stats.sessionsBytes)
check('orphan cache excludes fresh file', state.data.orphanCache.count === 1, state.data.orphanCache)
check('orphanCache available', state.data.orphanCache.available === true)
check('live flag', state.data.sessions.find((row) => row.id === liveId)?.live === true)
check('trash empty', state.data.trash.length === 0)

const pruneArchived = await callAction({ op: 'pruneArchived' })
check('pruneArchived pruned 1', pruneArchived.data.pruned === 1, pruneArchived.data.pruned)
check('ghost unpinned', !pruneArchived.data.state.pinnedSessionIds.includes('session-ghost-0000'))

const pruneCache = await callAction({ op: 'pruneOrphanCache' })
check('pruneOrphanCache removed 1', pruneCache.data.results[0].removed === 1, pruneCache.data.results[0])
const goneOld = await stat(path.join(cacheDir, orphanOld + '.json')).then(() => true, () => false)
const goneFresh = await stat(path.join(cacheDir, orphanFresh + '.json')).then(() => true, () => false)
check('old orphan deleted', goneOld === false)
check('fresh orphan kept', goneFresh === true)

const liveDelete = await callAction({ op: 'delete', sessionIds: [liveId] })
check('live session skipped', liveDelete.data.results[0].skipped === true, liveDelete.data.results[0])

const coldDelete = await callAction({ op: 'delete', sessionIds: [coldId], labels: { [coldId]: 'Cold session' } })
const batch = coldDelete.data.results[0].batch
check('cold delete ok', coldDelete.data.results[0].ok === true, coldDelete.data.results[0])
check('batch named', typeof batch === 'string' && batch.startsWith('session-cleanup-'), batch)
check('session dir moved', await stat(path.join(home, 'sessions', group, coldId)).then(() => false, () => true))
check('trash has batch', coldDelete.data.state.trash.length === 1, coldDelete.data.state.trash.length)
check('trash label kept', coldDelete.data.state.trash[0].items[0].title === 'Cold session', coldDelete.data.state.trash[0].items[0])
check('trash bytes > 0', coldDelete.data.state.trash[0].bytes > 0, coldDelete.data.state.trash[0].bytes)

const restore = await callAction({ op: 'restore', batch, sessionIds: [coldId] })
check('restore ok', restore.data.restored === 1, restore.data.results[0])
check('session back', await stat(path.join(home, 'sessions', group, coldId, 'session.v4.jsonl.zstd')).then(() => true, () => false))
check('cache back', await stat(path.join(cacheDir, coldId + '.json')).then(() => true, () => false))
check('batch removed after full restore', await stat(path.join(home, 'backups', batch)).then(() => false, () => true))

const again = await callAction({ op: 'delete', sessionIds: [coldId] })
const batch2 = again.data.results[0].batch
const purgeOne = await callAction({ op: 'purge', batch: batch2, sessionIds: [coldId] })
check('purge one ok', purgeOne.data.purged === 1, purgeOne.data.results[0])
check('batch folder removed', await stat(path.join(home, 'backups', batch2)).then(() => false, () => true))

const bad = await callAction({ op: 'nope' })
check('bad op 400', bad.status === 400, bad.status)
const badBatch = await callAction({ op: 'restore', batch: '../evil' })
check('traversal refused', badBatch.data.results[0].ok === false, badBatch.data.results[0])

const summary = results.map((row) => `${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.ok ? '' : '  -> ' + JSON.stringify(row.detail)}`)
console.log(summary.join('\n'))
const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await rm(home, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
