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
await writeFile(
  path.join(cacheDir, coldId + '.json'),
  JSON.stringify({
    version: 7,
    record: {
      rows: {
        turnOutline: {
          ver: 2,
          seq: 40,
          val: {
            turns: Array.from({ length: 7 }, (_, index) => ({
              turn: index + 1,
              seq: index * 2 + 1,
              prompt: 'cached prompt ' + String(index + 1),
              response: 'cached answer ' + String(index + 1),
            })),
            draft: '',
          },
        },
      },
    },
  }),
  'utf8',
)
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

const previewEvents = [
  {
    type: 'user/message',
    seq: 1,
    data: { message: { role: 'user', content: [{ type: 'text', text: 'why is my session so large?' }] } },
  },
  {
    type: 'assistant/message',
    seq: 2,
    data: { message: { role: 'assistant', content: [{ type: 'text', text: 'Because the log keeps every tool result.' }] } },
  },
  { type: 'tool/call', seq: 3, data: { name: 'read', arguments: '{}' } },
  {
    type: 'user/message',
    seq: 4,
    data: { message: { role: 'user', content: [{ type: 'text', text: 'ok, delete it' }] } },
  },
]

const emitted = []

const services = {
  webServer: { register: () => () => {} },
  workspaceRegistry: registry,
  sessions: { get: (id) => (id === liveId ? { id } : undefined) },
  agents: { get: () => undefined },
  sessionPersistence: {
    list: async () => [liveSession, coldSession],
    stat: async (id) =>
      id === liveId
        ? { ...liveSession, eventCount: previewEvents.length }
        : id === coldId
          ? { ...coldSession, header: { id: coldId, cwd: 'D:/demo/project', createdAt: 1 }, eventCount: 0 }
          : undefined,
    open: async (id) => {
      if (id !== liveId) throw new Error('session-not-found')
      return {
        read: async (from, length) => ({ events: previewEvents.slice(from, from + length) }),
        close: async () => {},
      }
    },
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
  emit: (name, id) => {
    emitted.push([name, id])
  },
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

async function callPreview(id) {
  const handler = routes.get('/dsh-session-cleanup/preview')
  const res = fakeResponse()
  const url = '/dsh-session-cleanup/preview' + (id === undefined ? '' : '?id=' + encodeURIComponent(id))
  await handler({ method: 'GET', url, headers: { host: '127.0.0.1:1' } }, res)
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

const preview = await callPreview(liveId)
check('preview 200', preview.status === 200, preview.status)
check('preview keeps message order', preview.data.items.map((item) => item.seq).join(',') === '1,2,4', preview.data.items)
check('preview roles', preview.data.items[0].role === 'user' && preview.data.items[1].role === 'assistant')
check('preview text', preview.data.items[0].text === 'why is my session so large?', preview.data.items[0])
check('preview skips non-message events', preview.data.items.length === 3, preview.data.items.length)
check('preview reports size and turn count', preview.data.sizeBytes === 4096 && preview.data.turnCount === 0, preview.data)
const cachedPreview = await callPreview(coldId)
check('cached outline is preferred', cachedPreview.data.turnCount === 7, cachedPreview.data.turnCount)
check('cached outline keeps turn order', cachedPreview.data.items[0].role === 'user' && cachedPreview.data.items[1].role === 'assistant')
check('cached outline keeps the newest turns', cachedPreview.data.items.length === 12, cachedPreview.data.items.length)
check('cached outline marks truncation', cachedPreview.data.truncated === true, cachedPreview.data.truncated)
const missingPreview = await callPreview('session-nope-0000')
check('preview 404 for unknown session', missingPreview.status === 404, missingPreview.status)
const badPreview = await callPreview(undefined)
check('preview 400 without id', badPreview.status === 400, badPreview.status)

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
check(
  'delete announces the removal to clients',
  emitted.some(([name, id]) => name === 'api-session/removed' && id === coldId),
  emitted,
)
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

// Additional cold sessions for fault-injection and path-safety tests. These are
// registered after the original suite so earlier assertions stay stable.
const extraListed = []
const origList = services.sessionPersistence.list
const origStat = services.sessionPersistence.stat
services.sessionPersistence.list = async () => [...(await origList()), ...extraListed]
services.sessionPersistence.stat = async (id, opts) => {
  const hit = extraListed.find((item) => item.header.id === id)
  return hit ?? origStat(id, opts)
}

async function addCold(id, bytes = 1024) {
  await mkdir(path.join(home, 'sessions', group, id), { recursive: true })
  await writeFile(path.join(home, 'sessions', group, id, 'session.v4.jsonl.zstd'), Buffer.alloc(bytes, 7))
  const snapshot = {
    header: { id },
    sizeBytes: bytes,
    location: { kind: 'file', path: path.join(home, 'sessions', group, id, 'session.v4.jsonl.zstd') },
  }
  extraListed.push(snapshot)
  return snapshot
}

function sessionDirExists(id) {
  return stat(path.join(home, 'sessions', group, id, 'session.v4.jsonl.zstd')).then(() => true, () => false)
}

// --- path constraint: a crafted manifest must not escape backups/sessions ---
const canary = path.join(home, 'CANARY.txt')
await writeFile(canary, 'keep')
const evilBatch = 'session-cleanup-20990101-000000-000'
const evilDir = path.join(home, 'backups', evilBatch)
await mkdir(path.join(evilDir, 'sessions'), { recursive: true })
await writeFile(
  path.join(evilDir, 'manifest.json'),
  JSON.stringify({
    createdAt: '2099-01-01T00:00:00.000Z',
    items: [{ sessionId: 'CANARY.txt', cwdDir: '..', cacheFile: '', title: 'evil', sizeBytes: 1 }],
  }),
  'utf8',
)
const evilRestore = await callAction({ op: 'restore', batch: evilBatch, sessionIds: ['CANARY.txt'] })
check('restore rejects dotted cwdDir', evilRestore.data.results[0].ok === false, evilRestore.data.results[0])
check(
  'restore names a path error',
  ['invalid-batch-path', 'path-escape-rejected'].includes(evilRestore.data.results[0].failures?.[0]?.error)
    || ['invalid-batch-path', 'path-escape-rejected'].includes(evilRestore.data.results[0].error),
  evilRestore.data.results[0],
)
check('canary intact after restore attempt', (await readFile(canary, 'utf8')) === 'keep')
const evilPurge = await callAction({ op: 'purge', batch: evilBatch, sessionIds: ['CANARY.txt'] })
check('purge rejects dotted cwdDir', evilPurge.data.results[0].ok === false, evilPurge.data.results[0])
check('canary intact after purge attempt', (await readFile(canary, 'utf8')) === 'keep')
check('evil batch folder kept for inspection', await stat(evilDir).then(() => true, () => false))

// --- shared-batch rollback: a later move failure must not rm earlier successes ---
const extraA = 'session-cold-aaaa'
const extraB = 'session-cold-bbbb'
await addCold(extraA, 2048)
await addCold(extraB, 2048)
process.env.DSHSC_TEST_HOOKS = '1'
process.env.DSHSC_FAIL_MOVE = extraB
const shared = await callAction({ op: 'delete', sessionIds: [extraA, extraB], labels: { [extraA]: 'A', [extraB]: 'B' } })
delete process.env.DSHSC_FAIL_MOVE
check('shared batch first session ok', shared.data.results[0]?.ok === true, shared.data.results[0])
check('shared batch second session failed', shared.data.results[1]?.ok === false, shared.data.results[1])
check('shared batch failure is the injected move', String(shared.data.results[1]?.error ?? '').includes('injected-move-failure'), shared.data.results[1])
const sharedBatch = shared.data.results[0]?.batch
check('shared batch name kept', typeof sharedBatch === 'string' && sharedBatch.startsWith('session-cleanup-'), sharedBatch)
check('successful session left sessions root', await sessionDirExists(extraA) === false)
check('failed session remains in sessions root', await sessionDirExists(extraB) === true)
check(
  'successful session is still in the recycle bin',
  (shared.data.state.trash ?? []).some((batch) => batch.batch === sharedBatch && batch.items.some((item) => item.sessionId === extraA && item.title === 'A')),
  shared.data.state.trash,
)
check(
  'failed session is not recorded in the recycle bin',
  !(shared.data.state.trash ?? []).some((batch) => batch.items.some((item) => item.sessionId === extraB)),
  shared.data.state.trash,
)
check('shared batch directory kept', await stat(path.join(home, 'backups', sharedBatch)).then(() => true, () => false))
const restoreA = await callAction({ op: 'restore', batch: sharedBatch, sessionIds: [extraA] })
check('shared batch survivor can be restored', restoreA.data.restored === 1, restoreA.data.results[0])
check('restored survivor is back on disk', await sessionDirExists(extraA) === true)

// --- manifest write failure rolls this session back ---
const extraC = 'session-cold-cccc'
await addCold(extraC, 512)
process.env.DSHSC_FAIL_MANIFEST = extraC
const manifestFail = await callAction({ op: 'delete', sessionIds: [extraC] })
delete process.env.DSHSC_FAIL_MANIFEST
check('manifest failure is reported', manifestFail.data.results[0]?.ok === false && manifestFail.data.results[0]?.error === 'manifest-write-failed', manifestFail.data.results[0])
check('manifest failure leaves the session in place', await sessionDirExists(extraC) === true)
check(
  'manifest failure does not hide the session in trash only',
  !(manifestFail.data.state.trash ?? []).some((batch) => batch.items.some((item) => item.sessionId === extraC)),
  manifestFail.data.state.trash,
)

// Discovery: a batch whose manifest is missing must still be listed and restorable.
const extraD = 'session-cold-dddd'
await addCold(extraD, 768)
const recoveredBatch = 'session-cleanup-20990101-010101-001'
const recoveredParent = path.join(home, 'backups', recoveredBatch, 'sessions', group)
const recoveredDir = path.join(recoveredParent, extraD)
await mkdir(recoveredDir, { recursive: true })
const recoveredLog = 'session.v4.jsonl.zstd'
await writeFile(
  path.join(recoveredDir, recoveredLog),
  await readFile(path.join(home, 'sessions', group, extraD, recoveredLog)),
)
await rm(path.join(home, 'sessions', group, extraD), { recursive: true, force: true })
const recoveredState = await callState()
const recoveredEntry = (recoveredState.data.trash ?? []).find((batch) => batch.batch === recoveredBatch)
check('orphan batch without manifest is listed', recoveredEntry !== undefined && recoveredEntry.items.some((item) => item.sessionId === extraD), recoveredState.data.trash)
const recover = await callAction({ op: 'restore', batch: recoveredBatch, sessionIds: [extraD] })
check('discovered session can be restored', recover.data.restored === 1, recover.data.results[0])
check('discovered session is back on disk', await sessionDirExists(extraD) === true)

// Drop the crafted traversal batch so emptyTrash counts only the two fixtures.
await rm(evilDir, { recursive: true, force: true })

// emptyTrash reports session counts, not just batch directories.
const emptyOne = 'session-cleanup-20990101-020202-002'
const emptyTwo = 'session-cleanup-20990101-020202-003'
for (const [name, ids] of [[emptyOne, ['s-a', 's-b']], [emptyTwo, ['s-c']]]) {
  const dir = path.join(home, 'backups', name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ createdAt: '2099-01-01T00:00:00.000Z', items: ids.map((sessionId) => ({ sessionId, cwdDir: group, title: sessionId, sizeBytes: 1 })) }),
    'utf8',
  )
}
const emptied = await callAction({ op: 'emptyTrash' })
check('emptyTrash ok', emptied.data.results[0]?.ok === true, emptied.data.results[0])
check('emptyTrash counts sessions not batches', emptied.data.purged === 3 && emptied.data.purgedSessions === 3, emptied.data)
check('emptyTrash also reports batch count', emptied.data.purgedBatches === 2, emptied.data)
check('emptyTrash leaves no session-cleanup batches', (emptied.data.state.trash ?? []).length === 0, emptied.data.state.trash)
delete process.env.DSHSC_TEST_HOOKS

// Targeted R1-R5 regressions (official suite). Isolated temp fixtures only.
const existsPath = async (target) => stat(target).then(() => true, () => false)
const r1Batch = 'session-cleanup-20990101-030303-010'
const r1Dir = path.join(home, 'backups', r1Batch)
await mkdir(path.join(r1Dir, 'sessions', group, 'session-r1-cache'), { recursive: true })
await writeFile(path.join(r1Dir, 'sessions', group, 'session-r1-cache', 'session.v4.jsonl.zstd'), 'R1-LOG')
await mkdir(path.join(r1Dir, 'projcache'), { recursive: true })
await writeFile(path.join(r1Dir, 'projcache', 'session-r1-cache.json'), 'R1-CACHE')
const r1Restore = await callAction({ op: 'restore', batch: r1Batch, sessionIds: ['session-r1-cache'] })
check('R1 missing-manifest restore reports success', r1Restore.data.restored === 1, r1Restore.data.results[0])
check('R1 missing-manifest restores the log', (await readFile(path.join(home, 'sessions', group, 'session-r1-cache', 'session.v4.jsonl.zstd'), 'utf8')) === 'R1-LOG')
check('R1 missing-manifest restores the matching cache', (await readFile(path.join(cacheDir, 'session-r1-cache.json'), 'utf8')) === 'R1-CACHE')
check('R1 missing-manifest does not leave the cache in the batch', await existsPath(path.join(r1Dir, 'projcache', 'session-r1-cache.json')) === false)

const r2NullBatch = 'session-cleanup-20990101-030303-011'
const r2NullDir = path.join(home, 'backups', r2NullBatch)
await mkdir(path.join(r2NullDir, 'sessions', group, 'session-r2-null'), { recursive: true })
await writeFile(path.join(r2NullDir, 'sessions', group, 'session-r2-null', 'log'), 'R2-NULL')
await writeFile(path.join(r2NullDir, 'manifest.json'), 'null', 'utf8')
const r2Null = await callAction({ op: 'restore', batch: r2NullBatch, sessionIds: ['session-r2-null'] })
check('R2 null manifest does not 500', r2Null.status === 200 && r2Null.data.restored === 1, r2Null)

const r2ItemsBatch = 'session-cleanup-20990101-030303-012'
const r2ItemsDir = path.join(home, 'backups', r2ItemsBatch)
await mkdir(path.join(r2ItemsDir, 'sessions', group, 'session-r2-items'), { recursive: true })
await writeFile(path.join(r2ItemsDir, 'sessions', group, 'session-r2-items', 'log'), 'R2-ITEMS')
await writeFile(path.join(r2ItemsDir, 'manifest.json'), '{"items":[null]}', 'utf8')
const r2Items = await callAction({ op: 'restore', batch: r2ItemsBatch, sessionIds: ['session-r2-items'] })
check('R2 null items do not 500', r2Items.status === 200 && r2Items.data.restored === 1, r2Items)

const r2ShadowBatch = 'session-cleanup-20990101-030303-013'
const r2ShadowDir = path.join(home, 'backups', r2ShadowBatch)
await mkdir(path.join(r2ShadowDir, 'sessions', group, 'session-r2-shadow'), { recursive: true })
await writeFile(path.join(r2ShadowDir, 'sessions', group, 'session-r2-shadow', 'log'), 'R2-SHADOW')
await writeFile(path.join(r2ShadowDir, 'manifest.json'), JSON.stringify({ items: [{ sessionId: 'session-r2-shadow', cwdDir: '..', cacheFile: '' }] }), 'utf8')
const r2Shadow = await callAction({ op: 'restore', batch: r2ShadowBatch, sessionIds: ['session-r2-shadow'] })
check('R2 illegal record does not shadow a real tree', r2Shadow.status === 200 && r2Shadow.data.restored === 1, r2Shadow)
check('R2 shadowed session is restored from the real path', (await readFile(path.join(home, 'sessions', group, 'session-r2-shadow', 'log'), 'utf8')) === 'R2-SHADOW')

const r3Id = 'session-r3-retry'
await addCold(r3Id, 8)
await writeFile(path.join(home, 'sessions', group, r3Id, 'session.v4.jsonl.zstd'), 'R3-LOG')
await writeFile(path.join(cacheDir, r3Id + '.json'), 'R3-CACHE')
const r3Delete = await callAction({ op: 'delete', sessionIds: [r3Id] })
const r3Batch = r3Delete.data.results[0]?.batch
check('R3 delete moved the session into a batch', typeof r3Batch === 'string' && r3Batch.startsWith('session-cleanup-'), r3Delete.data.results[0])
const r3CacheDest = path.join(cacheDir, r3Id + '.json')
await mkdir(r3CacheDest)
await writeFile(path.join(r3CacheDest, 'block'), 'BLOCK')
const r3First = await callAction({ op: 'restore', batch: r3Batch, sessionIds: [r3Id] })
check('R3 cache collision is not reported as success', r3First.data.results[0]?.ok === false, r3First.data.results[0])
check('R3 rolls the session log back into the batch', await existsPath(path.join(home, 'backups', r3Batch, 'sessions', group, r3Id, 'session.v4.jsonl.zstd')) === true)
await rm(r3CacheDest, { recursive: true, force: true })
const r3Retry = await callAction({ op: 'restore', batch: r3Batch, sessionIds: [r3Id] })
check('R3 retry succeeds after the obstacle is removed', r3Retry.data.results[0]?.ok === true && r3Retry.data.restored === 1, r3Retry.data.results[0])
check('R3 retry restores the log', (await readFile(path.join(home, 'sessions', group, r3Id, 'session.v4.jsonl.zstd'), 'utf8')) === 'R3-LOG')
check('R3 retry restores the cache', (await readFile(path.join(cacheDir, r3Id + '.json'), 'utf8')) === 'R3-CACHE')

const r5Live = 'session-r5-live'
const r5Good = 'session-r5-good'
await addCold(r5Good, 8)
await addCold(r5Live, 8)
const previousGet = services.sessions.get
services.sessions.get = (id) => (id === liveId || id === r5Live ? { id } : undefined)
const r5Mixed = await callAction({ op: 'delete', sessionIds: [r5Good, r5Live, 'session-r5-missing'] })
services.sessions.get = previousGet
check(
  'R5 failedCount excludes skipped',
  r5Mixed.data.okCount === 1 && r5Mixed.data.failedCount === 1 && r5Mixed.data.skippedCount === 1,
  { ok: r5Mixed.data.okCount, failed: r5Mixed.data.failedCount, skipped: r5Mixed.data.skippedCount, results: r5Mixed.data.results },
)

const summary = results.map((row) => `${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.ok ? '' : '  -> ' + JSON.stringify(row.detail)}`)
console.log(summary.join('\n'))
const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await rm(home, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
