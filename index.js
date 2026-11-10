/**
 * Host half of the session-cleanup bundle.
 *
 * DSH has no session-delete capability (a Workspace registration removal
 * deliberately leaves session histories in place), so this plugin owns the
 * missing operations: archive, restore-from-archive, and a reversible delete.
 *
 * Deletion is REVERSIBLE by construction: the session directory and its
 * projection-cache file are moved into
 * `~/.dsh/backups/session-cleanup-<stamp>/` together with a manifest, and the
 * panel can move any batch — or a single session of it — back. Only `purge`
 * (explicitly requested per batch or per session) removes bytes for good.
 *
 * Routes (same-origin only):
 *   GET  /dsh-session-cleanup/state   – workspaces, archive/pin sets, sessions, trash, stats
 *   POST /dsh-session-cleanup/action  – archive | unarchive | delete | restore | purge
 *                                       | pruneArchived | pruneOrphanCache | emptyTrash
 *
 * A Session still attached to a live Agent owns its log writer, so it is skipped
 * rather than moved. Nothing outside `$DSH_HOME/sessions` is ever moved, and
 * nothing outside `$DSH_HOME/backups` is ever removed.
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROUTE_STATE = '/dsh-session-cleanup/state'
const ROUTE_ACTION = '/dsh-session-cleanup/action'
const MAX_BODY_BYTES = 64 * 1024
const MAX_LABEL_CHARS = 200
const MOVE_ATTEMPTS = 8
const MOVE_RETRY_MS = 150
const TRASH_PREFIX = 'session-cleanup-'
const BATCH_NAME = /^session-cleanup-[0-9A-Za-z-]+$/
const MAX_SCAN_FILES = 4000
/** A cache file younger than this may belong to a Session being created right now. */
const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000
const STATE_TIMEOUT_MS = 20_000

/** Services this plugin needs before it can register routes. */
export const inject = ['webServer']

/**
 * Register the plugin's routes.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: ROUTE_STATE, handler: guarded(ctx, handleState) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTE_ACTION, handler: guarded(ctx, handleAction) }),
    ]
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {}
      }
    }
  })
}

/**
 * Wrap one handler with the method/origin checks both routes share.
 * @param ctx - Host plugin context.
 * @param handler - The route's own handler.
 * @returns the composed handler.
 */
function guarded(ctx, handler) {
  return async (request, response) => {
    const expected = handler === handleState ? 'GET' : 'POST'
    if (request.method !== expected) {
      response.writeHead(405, { allow: expected })
      response.end()
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: 'untrusted origin' })
      return
    }
    try {
      await handler(ctx, request, response)
    } catch (error) {
      sendJson(response, 500, { error: messageOf(error) })
    }
  }
}

/**
 * Answer the panel's state read.
 * @param ctx - Host plugin context.
 * @param request - Incoming request.
 * @param response - Response to complete.
 */
async function handleState(ctx, request, response) {
  sendJson(response, 200, await readState(ctx))
}

/**
 * Apply one panel action.
 * @param ctx - Host plugin context.
 * @param request - Incoming request carrying the JSON body.
 * @param response - Response to complete.
 */
async function handleAction(ctx, request, response) {
  const body = await readJsonBody(request)
  const op = body?.op
  const allowed = [
    'archive',
    'unarchive',
    'delete',
    'restore',
    'purge',
    'pruneArchived',
    'pruneOrphanCache',
    'emptyTrash',
  ]
  if (!allowed.includes(op)) {
    sendJson(response, 400, { error: 'op must be one of ' + allowed.join(', ') })
    return
  }
  const requested = Array.isArray(body?.sessionIds) ? body.sessionIds : []
  const ids = [...new Set(requested.filter((id) => typeof id === 'string' && id.length > 0))]
  const batch = typeof body?.batch === 'string' && body.batch !== '' ? body.batch : undefined
  const labels = body?.labels !== null && typeof body?.labels === 'object' ? body.labels : undefined

  let results
  if (op === 'pruneArchived') {
    results = [await pruneArchived(ctx)]
  } else if (op === 'pruneOrphanCache') {
    results = [await pruneOrphanCache(ctx)]
  } else if (op === 'emptyTrash') {
    results = [await emptyTrash()]
  } else if (op === 'restore' || op === 'purge') {
    if (batch === undefined) {
      sendJson(response, 400, { error: 'batch is required for ' + op })
      return
    }
    results = [await applyBatch(ctx, op, batch, ids)]
  } else {
    if (ids.length === 0) {
      sendJson(response, 400, { error: 'sessionIds is required' })
      return
    }
    // One action is one trash batch, so a bulk delete is undoable as a unit.
    const sharedBatch = op === 'delete' ? newBatchName() : undefined
    results = []
    for (const sessionId of ids) {
      results.push(await applyOne(ctx, op, sessionId, sharedBatch, labelOf(labels?.[sessionId])))
    }
  }

  const failed = results.filter((result) => result.ok !== true)
  const skipped = results.filter((result) => result.skipped === true)
  const extra = {}
  if (op === 'pruneArchived') extra.pruned = results[0]?.removed ?? 0
  if (op === 'pruneOrphanCache') {
    extra.removed = results[0]?.removed ?? 0
    extra.freed = results[0]?.freed ?? 0
  }
  if (op === 'emptyTrash') extra.purged = results[0]?.purged ?? 0
  if (op === 'purge') extra.purged = results[0]?.purged ?? 0
  if (op === 'restore') extra.restored = results[0]?.restored ?? 0

  sendJson(response, 200, {
    op,
    results,
    okCount: results.length - failed.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    ...extra,
    state: await readState(ctx),
  })
}

/**
 * Apply one per-session operation.
 * @param ctx - Host plugin context.
 * @param op - archive | unarchive | delete.
 * @param sessionId - Target Session.
 * @param batchName - Trash batch shared by one delete action.
 * @param label - Display title captured at delete time, if the caller knew it.
 * @returns a per-session outcome.
 */
async function applyOne(ctx, op, sessionId, batchName, label) {
  if (op === 'delete') return moveToTrash(ctx, sessionId, batchName, label)
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return { sessionId, ok: false, error: 'workspaces-unavailable' }
  try {
    if (op === 'archive') await registry.archiveSession(sessionId, { stopActivity: true })
    else await registry.unarchiveSession(sessionId)
    return { sessionId, ok: true }
  } catch (error) {
    return { sessionId, ok: false, error: messageOf(error) }
  }
}

/**
 * Restore or permanently purge one trash batch, or a subset of its sessions.
 * @param ctx - Host plugin context.
 * @param op - restore | purge.
 * @param batch - Trash batch directory name.
 * @param sessionIds - Optional subset; empty applies to the whole batch.
 * @returns the batch outcome.
 */
async function applyBatch(ctx, op, batch, sessionIds) {
  const home = dshHome()
  if (home === undefined) return { batch, ok: false, error: 'dsh-home-unavailable' }
  if (!BATCH_NAME.test(batch)) return { batch, ok: false, error: 'invalid-batch-name' }
  const backups = path.join(home, 'backups')
  const batchDir = path.join(backups, batch)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
  } catch {
    return { batch, ok: false, error: 'batch-not-found' }
  }
  const items = Array.isArray(manifest.items) ? manifest.items : []
  const wanted = sessionIds.length === 0 ? undefined : new Set(sessionIds)
  const selected = items.filter((item) => wanted === undefined || wanted.has(String(item.sessionId)))
  if (selected.length === 0) return { batch, ok: false, error: 'nothing-selected' }

  if (op === 'purge') {
    if (wanted === undefined) {
      try {
        await rm(batchDir, { recursive: true, force: true })
        return { batch, ok: true, purged: items.length }
      } catch (error) {
        return { batch, ok: false, error: messageOf(error) }
      }
    }
    const failures = []
    const purgedIds = new Set()
    for (const item of selected) {
      try {
        await rm(path.join(batchDir, 'sessions', String(item.cwdDir ?? ''), String(item.sessionId)), {
          recursive: true,
          force: true,
        })
        if (typeof item.cacheFile === 'string' && item.cacheFile !== '') {
          await rm(path.join(batchDir, 'projcache', item.cacheFile), { force: true })
        }
        purgedIds.add(String(item.sessionId))
      } catch (error) {
        failures.push({ sessionId: String(item.sessionId), error: messageOf(error) })
      }
    }
    const kept = items.filter((item) => !purgedIds.has(String(item.sessionId)))
    await shrinkBatch(batchDir, manifest, items, kept)
    return { batch, ok: failures.length === 0, purged: purgedIds.size, failures }
  }

  const restored = []
  const failures = []
  for (const item of selected) {
    const cwdDir = String(item.cwdDir ?? '')
    if (cwdDir === '') {
      failures.push({ sessionId: String(item.sessionId), error: 'batch-entry-has-no-directory' })
      continue
    }
    const target = path.join(home, 'sessions', cwdDir, String(item.sessionId))
    try {
      if (await exists(target)) {
        failures.push({ sessionId: String(item.sessionId), error: 'already-exists' })
        continue
      }
      await mkdir(path.dirname(target), { recursive: true })
      await moveWithRetry(path.join(batchDir, 'sessions', cwdDir, String(item.sessionId)), target)
      if (typeof item.cacheFile === 'string' && item.cacheFile !== '') {
        const cacheSource = path.join(batchDir, 'projcache', item.cacheFile)
        const cacheTarget = path.join(home, 'storages', 'session_projcache', 'sessions', item.cacheFile)
        if (await exists(cacheSource)) {
          await mkdir(path.dirname(cacheTarget), { recursive: true })
          await moveWithRetry(cacheSource, cacheTarget)
        }
      }
      restored.push(String(item.sessionId))
    } catch (error) {
      failures.push({ sessionId: String(item.sessionId), error: messageOf(error) })
    }
  }

  const done = new Set(restored)
  const remaining = items.filter((item) => !done.has(String(item.sessionId)))
  await shrinkBatch(batchDir, manifest, items, remaining)
  // The Session list is served from a projection cache; drop the stale rows so
  // restored sessions show up on the very next read instead of after a restart.
  await refreshSessionCaches(ctx)
  return { batch, ok: failures.length === 0, restored: restored.length, failures }
}

/**
 * Rewrite a batch manifest after a subset operation, dropping the batch folder
 * once it holds nothing.
 * @param batchDir - Absolute batch directory.
 * @param manifest - Parsed manifest to rewrite.
 * @param before - Items the manifest held.
 * @param remaining - Items that must stay.
 */
async function shrinkBatch(batchDir, manifest, before, remaining) {
  if (remaining.length === before.length) return
  if (remaining.length === 0) {
    try {
      await rm(batchDir, { recursive: true, force: true })
    } catch {}
    return
  }
  try {
    manifest.items = remaining
    await writeFile(path.join(batchDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  } catch {}
}

/**
 * Drop archive/pin entries whose Session log no longer exists on disk.
 * @param ctx - Host plugin context.
 * @returns the number of archive entries removed.
 */
async function pruneArchived(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return { ok: false, error: 'workspaces-unavailable' }
  const snapshots = await listSnapshots(ctx)
  if (snapshots === undefined) return { ok: false, error: 'session-persistence-unavailable' }
  let removed = 0
  for (const id of [...(registry.archivedSessionIds ?? [])]) {
    if (snapshots.has(String(id))) continue
    try {
      await registry.unarchiveSession(id)
      removed += 1
    } catch {}
  }
  for (const id of [...(registry.pinnedSessionIds ?? [])]) {
    if (snapshots.has(String(id))) continue
    try {
      await registry.unpinSession(id)
    } catch {}
  }
  return { ok: true, removed }
}

/**
 * Delete projection-cache files whose Session log is gone.
 *
 * The persistence list is the only authority here: when it is unavailable the
 * scan refuses instead of treating the world as empty.
 * @param ctx - Host plugin context.
 * @returns the number of files and bytes removed.
 */
async function pruneOrphanCache(ctx) {
  const home = dshHome()
  if (home === undefined) return { ok: false, error: 'dsh-home-unavailable' }
  const snapshots = await listSnapshots(ctx)
  if (snapshots === undefined) return { ok: false, error: 'session-persistence-unavailable' }
  const scan = await scanOrphanCache(home, new Set(snapshots.keys()))
  let removed = 0
  let freed = 0
  for (const item of scan.files) {
    try {
      await rm(item.path, { force: true })
      removed += 1
      freed += item.bytes
    } catch {}
  }
  return { ok: true, removed, freed }
}

/**
 * Purge every trash batch.
 * @returns the number of batches removed.
 */
async function emptyTrash() {
  const home = dshHome()
  if (home === undefined) return { ok: false, error: 'dsh-home-unavailable' }
  const backups = path.join(home, 'backups')
  let entries
  try {
    entries = await readdir(backups, { withFileTypes: true })
  } catch {
    return { ok: true, purged: 0 }
  }
  let purged = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TRASH_PREFIX) || !BATCH_NAME.test(entry.name)) continue
    try {
      await rm(path.join(backups, entry.name), { recursive: true, force: true })
      purged += 1
    } catch {}
  }
  return { ok: true, purged }
}

/**
 * Ask the Host to rebuild the derived Session read-models it exposes.
 * @param ctx - Host plugin context.
 */
async function refreshSessionCaches(ctx) {
  const cache = ctx.get('sessionProjectionCache')
  if (typeof cache?.flush === 'function') {
    try {
      await cache.flush()
    } catch {}
  }
  const query = ctx.get('sessionQuery')
  if (typeof query?.reconcile === 'function') {
    try {
      await query.reconcile()
    } catch {}
  }
}

/**
 * Move one cold Session's directory and cache into a trash batch.
 * @param ctx - Host plugin context.
 * @param sessionId - Session to remove.
 * @param batchName - Batch shared by the whole delete action.
 * @param label - Title captured by the panel, stored for the recycle bin.
 * @returns the outcome naming the batch and the moved paths.
 */
async function moveToTrash(ctx, sessionId, sharedBatch, label) {
  if (isAttached(ctx, sessionId)) {
    return {
      sessionId,
      ok: false,
      skipped: true,
      error: 'session-in-use',
      reason: '这个会话正在使用中（已打开或正在运行），请先切换到其他会话再删除。',
    }
  }

  const home = dshHome()
  if (home === undefined) return { sessionId, ok: false, error: 'dsh-home-unavailable' }

  const snapshots = await listSnapshots(ctx)
  const snapshot = snapshots?.get(sessionId)
  let location = typeof snapshot?.location?.path === 'string' ? snapshot.location.path : undefined
  if (location === undefined) {
    // `location` is optional on a listed snapshot; a direct stat still names it.
    const persistence = ctx.get('sessionPersistence')
    if (typeof persistence?.stat === 'function') {
      try {
        const fresh = await persistence.stat(sessionId, { signal: timeoutSignal(STATE_TIMEOUT_MS) })
        if (typeof fresh?.location?.path === 'string') location = fresh.location.path
      } catch {}
    }
  }
  if (location === undefined) {
    return { sessionId, ok: false, error: 'session-log-not-found' }
  }

  // The stored log lives at sessions/<cwdGroup>/<sessionId>/session.v4.jsonl.zstd,
  // so the session directory is the file's parent and the cwd group is one above it.
  const sessionDirectory = path.dirname(location)
  const sessionsRoot = path.join(home, 'sessions')
  const relative = path.relative(sessionsRoot, sessionDirectory)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { sessionId, ok: false, error: 'session-outside-home' }
  }
  const cwdDir = path.basename(path.dirname(sessionDirectory))
  if (cwdDir === '') return { sessionId, ok: false, error: 'session-outside-home' }

  const batchName = sharedBatch ?? newBatchName()
  const batchDir = path.join(home, 'backups', batchName)
  const cacheFile = `${sessionId}.json`
  const item = {
    sessionId,
    cwdDir,
    sessionDir: path.basename(sessionDirectory),
    cacheFile,
    title: label ?? '',
    sizeBytes: Number(snapshot?.sizeBytes ?? 0) || 0,
    deletedAt: new Date().toISOString(),
  }

  const moved = []
  const target = path.join(batchDir, 'sessions', cwdDir, sessionId)
  const cacheSource = path.join(home, 'storages', 'session_projcache', 'sessions', cacheFile)
  const cacheTarget = path.join(batchDir, 'projcache', cacheFile)
  const rollback = async () => {
    for (const entry of [...moved].reverse()) {
      try {
        if (entry === target) await moveWithRetry(target, sessionDirectory)
        else await moveWithRetry(cacheTarget, cacheSource)
      } catch {}
    }
    try {
      await rm(batchDir, { recursive: true, force: true })
    } catch {}
  }
  try {
    await mkdir(path.dirname(target), { recursive: true })
    await moveWithRetry(sessionDirectory, target)
    moved.push(target)

    if (await exists(cacheSource)) {
      await mkdir(path.dirname(cacheTarget), { recursive: true })
      await moveWithRetry(cacheSource, cacheTarget)
      moved.push(cacheTarget)
    } else {
      item.cacheFile = undefined
    }
  } catch (error) {
    await rollback()
    return { sessionId, ok: false, error: messageOf(error) }
  }

  // Record the batch so the panel can undo it later.
  const manifestPath = path.join(batchDir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    manifest = { createdAt: new Date().toISOString(), items: [] }
  }
  if (!Array.isArray(manifest.items)) manifest.items = []
  manifest.items.push(item)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  const registry = ctx.get('workspaceRegistry')
  const detached = []
  for (const workspace of registry?.list?.() ?? []) {
    const owns = [...(workspace.sessionIds ?? [])].some((id) => String(id) === sessionId)
    if (!owns) continue
    try {
      await workspace.detachSession?.(sessionId)
      detached.push(String(workspace.id ?? workspace.workspaceId ?? ''))
    } catch {}
  }
  try {
    await registry?.unarchiveSession?.(sessionId)
  } catch {}
  try {
    await registry?.unpinSession?.(sessionId)
  } catch {}

  return { sessionId, ok: true, batch: batchName, moved, detached }
}

/**
 * Whether an Agent still holds this Session, which keeps its log writer open.
 * @param ctx - Host plugin context.
 * @param sessionId - Session to probe.
 * @returns true when the Session must not be moved.
 */
function isAttached(ctx, sessionId) {
  if (ctx.get('sessions')?.get?.(sessionId) !== undefined) return true
  if (ctx.get('agents')?.get?.(sessionId) !== undefined) return true
  return false
}

/**
 * Read the panel's complete state.
 * @param ctx - Host plugin context.
 * @returns the state payload.
 */
async function readState(ctx) {
  const registry = ctx.get('workspaceRegistry')
  const workspaces = (registry?.list?.() ?? []).map((workspace) => ({
    workspaceId: String(workspace.id ?? workspace.workspaceId ?? ''),
    path: workspace.path ?? '',
    title: workspace.title ?? '',
    sessionIds: [...(workspace.sessionIds ?? [])].map(String),
  }))
  const snapshots = await listSnapshots(ctx)
  const sessions = await readSessions(ctx, snapshots)
  const trash = await readTrash()
  const orphanCache = await scanOrphanCache(dshHome(), snapshots === undefined ? undefined : new Set(snapshots.keys()))

  let sessionsBytes = 0
  for (const row of sessions) sessionsBytes += row.sizeBytes
  let trashBytes = 0
  let trashCount = 0
  for (const batch of trash) {
    trashBytes += batch.bytes
    trashCount += batch.count
  }

  return {
    workspaces,
    archivedSessionIds: [...(registry?.archivedSessionIds ?? [])].map(String),
    pinnedSessionIds: [...(registry?.pinnedSessionIds ?? [])].map(String),
    sessions,
    trash,
    orphanCache: { available: orphanCache.available, count: orphanCache.count, bytes: orphanCache.bytes },
    stats: {
      sessionCount: sessions.length,
      sessionsBytes,
      trashCount,
      trashBatches: trash.length,
      trashBytes,
      orphanCacheCount: orphanCache.count,
      orphanCacheBytes: orphanCache.bytes,
    },
  }
}

/**
 * Read every stored Session snapshot once, keyed by id.
 * @param ctx - Host plugin context.
 * @returns the map, or undefined when persistence is unavailable.
 */
async function listSnapshots(ctx) {
  const persistence = ctx.get('sessionPersistence')
  if (typeof persistence?.list !== 'function') return undefined
  try {
    const list = await persistence.list({ signal: timeoutSignal(STATE_TIMEOUT_MS) })
    const map = new Map()
    for (const snapshot of list ?? []) {
      const id = String(snapshot?.header?.id ?? '')
      if (id !== '') map.set(id, snapshot)
    }
    return map
  } catch {
    return undefined
  }
}

/**
 * Read one row per visible Session.
 * @param ctx - Host plugin context.
 * @param snapshots - Stored snapshots keyed by id, for size and existence.
 * @returns session rows; an unavailable Host yields an empty list.
 */
async function readSessions(ctx, snapshots) {
  const controller = ctx.get('sessionController')
  if (typeof controller?.list !== 'function') return []
  let value
  try {
    value = await controller.list({}, timeoutSignal(STATE_TIMEOUT_MS))
  } catch {
    return []
  }
  const rows = []
  for (const item of value?.items ?? []) {
    const id = String(item.sessionId ?? '')
    if (id === '') continue
    const title = item.projections?.values?.title
    rows.push({
      id,
      title: typeof title === 'string' ? title : '',
      updatedAt: Number(item.updatedAt ?? 0) || 0,
      blank: item.blank === true,
      running: item.running === true,
      live: item.agentAvailable === true || isAttached(ctx, id),
      cwd: typeof item.cwd === 'string' ? item.cwd : '',
      origin: item.origin ?? null,
      parentSessionId: typeof item.parentSessionId === 'string' ? item.parentSessionId : null,
      sizeBytes: Number(snapshots?.get(id)?.sizeBytes ?? 0) || 0,
    })
  }
  return rows
}

/**
 * List the trash batches the panel can restore or purge.
 * @returns batches, newest first.
 */
async function readTrash() {
  const home = dshHome()
  if (home === undefined) return []
  const backups = path.join(home, 'backups')
  let entries
  try {
    entries = await readdir(backups, { withFileTypes: true })
  } catch {
    return []
  }
  const batches = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TRASH_PREFIX) || !BATCH_NAME.test(entry.name)) continue
    const batchDir = path.join(backups, entry.name)
    try {
      const manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
      const items = Array.isArray(manifest.items) ? manifest.items : []
      const rows = items.map((item) => ({
        sessionId: String(item.sessionId),
        cwdDir: String(item.cwdDir ?? ''),
        title: typeof item.title === 'string' ? item.title : '',
        size: Number(item.sizeBytes ?? 0) || 0,
      }))
      batches.push({
        batch: entry.name,
        createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : '',
        count: rows.length,
        bytes: await directoryBytes(batchDir),
        items: rows,
      })
    } catch {}
  }
  batches.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
  return batches
}

/**
 * Sum the regular-file bytes under one directory, bounded.
 * @param root - Absolute directory.
 * @returns the byte total.
 */
async function directoryBytes(root) {
  let total = 0
  let seen = 0
  const queue = [root]
  while (queue.length > 0 && seen < MAX_SCAN_FILES) {
    const current = queue.pop()
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      seen += 1
      if (seen > MAX_SCAN_FILES) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (entry.isFile()) {
        try {
          total += (await stat(full)).size
        } catch {}
      }
    }
  }
  return total
}

/**
 * Find projection-cache files whose Session log is gone.
 * @param home - DSH home, or undefined when unknown.
 * @param known - Stored Session ids, or undefined when persistence is unavailable.
 * @returns the scanned orphans; unavailable when persistence could not be read.
 */
async function scanOrphanCache(home, known) {
  if (home === undefined || known === undefined) return { available: false, count: 0, bytes: 0, files: [] }
  const dir = path.join(home, 'storages', 'session_projcache', 'sessions')
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { available: true, count: 0, bytes: 0, files: [] }
  }
  const files = []
  let bytes = 0
  const now = Date.now()
  let seen = 0
  for (const entry of entries) {
    if (seen >= MAX_SCAN_FILES) break
    seen += 1
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const sessionId = entry.name.slice(0, -'.json'.length)
    if (known.has(sessionId)) continue
    const full = path.join(dir, entry.name)
    let info
    try {
      info = await stat(full)
    } catch {
      continue
    }
    // A just-written cache file may belong to a Session the list has not seen yet.
    if (now - info.mtimeMs < ORPHAN_MIN_AGE_MS) continue
    files.push({ path: full, file: entry.name, sessionId, bytes: info.size })
    bytes += info.size
  }
  return { available: true, count: files.length, bytes, files }
}

/**
 * The DSH home directory holding `sessions/`, `storages/`, and `backups/`.
 * @returns the absolute path, or undefined when it cannot be derived.
 */
function dshHome() {
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '') return process.env.DSH_HOME
  if (typeof process.env.USERPROFILE === 'string' && process.env.USERPROFILE !== '') {
    return path.join(process.env.USERPROFILE, '.dsh')
  }
  if (typeof process.env.HOME === 'string' && process.env.HOME !== '') return path.join(process.env.HOME, '.dsh')
  return undefined
}

/**
 * One compact, sortable batch name.
 * @returns `session-cleanup-YYYYMMDD-HHmmss-mmm`.
 */
function newBatchName() {
  const now = new Date()
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  const stamp =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds()) +
    '-' +
    pad(now.getMilliseconds(), 3)
  return TRASH_PREFIX + stamp
}

/**
 * Move a path, retrying briefly so a just-released Windows handle can settle.
 * @param source - Absolute source path.
 * @param target - Absolute destination path.
 */
async function moveWithRetry(source, target) {
  let lastError
  for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt += 1) {
    try {
      await rename(source, target)
      return
    } catch (error) {
      lastError = error
      if (error?.code === 'ENOENT') throw error
      if (error?.code === 'EXDEV') {
        // Different volume: copy the tree, then drop the source.
        await copyTree(source, target)
        await rm(source, { recursive: true, force: true })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, MOVE_RETRY_MS))
    }
  }
  throw lastError ?? new Error(`cannot move ${source} to ${target}`)
}

/**
 * Copy one directory tree (the EXDEV fallback for moving across volumes).
 * @param source - Absolute source directory.
 * @param target - Absolute destination directory.
 */
async function copyTree(source, target) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) await copyTree(from, to)
    else if (entry.isFile()) await writeFile(to, await readFile(from))
  }
}

/**
 * Whether a path exists.
 * @param target - Absolute path.
 * @returns true when it exists.
 */
async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * Read a bounded JSON body.
 * @param request - Incoming request.
 * @returns the parsed body, or undefined for an empty/invalid body.
 */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return undefined
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Keep one client-supplied label as display text only.
 * @param value - Candidate label.
 * @returns the trimmed label, or undefined.
 */
function labelOf(value) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '') return undefined
  return text.length > MAX_LABEL_CHARS ? text.slice(0, MAX_LABEL_CHARS) : text
}

/**
 * Send one JSON response.
 * @param response - Response to complete.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

/**
 * Reject cross-site writes: no Origin (same-document fetch) or a matching Host.
 * @param request - Incoming request.
 * @returns whether the request may proceed.
 */
function sameOrigin(request) {
  const site = request.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== '' && site !== 'same-origin' && site !== 'none') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

/**
 * Build a bounded cancellation signal.
 * @param ms - Timeout in milliseconds.
 * @returns the signal.
 */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error('timeout')), ms).unref?.()
  return controller.signal
}

/**
 * Render any thrown value as a message.
 * @param error - Thrown value.
 * @returns the message text.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
