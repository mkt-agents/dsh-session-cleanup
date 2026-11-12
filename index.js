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
const ROUTE_PREVIEW = '/dsh-session-cleanup/preview'
const MAX_BODY_BYTES = 64 * 1024
/** Events read from the tail of one log for the preview transcript. */
const PREVIEW_EVENTS = 400
/** Messages kept after filtering one preview read. */
const PREVIEW_ITEMS = 12
/** Turns kept from the cached outline. */
const PREVIEW_TURNS = 6
/** Characters kept per previewed message. */
const PREVIEW_CHARS = 280
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
      ctx.webServer.register({ kind: 'exact', path: ROUTE_PREVIEW, handler: guarded(ctx, handlePreview) }),
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
 * Wrap one handler with the method/origin checks the routes share.
 * @param ctx - Host plugin context.
 * @param handler - The route's own handler.
 * @returns the composed handler.
 */
function guarded(ctx, handler) {
  return async (request, response) => {
    const expected = handler === handleAction ? 'POST' : 'GET'
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
 * Answer one session preview read: the tail of the stored log, reduced to the
 * user and assistant text a person needs to recognise the conversation.
 * @param ctx - Host plugin context.
 * @param request - Incoming GET carrying `?id=`.
 * @param response - Response to complete.
 */
async function handlePreview(ctx, request, response) {
  let id = ''
  try {
    id = new URL(request.url ?? '/', 'http://localhost').searchParams.get('id') ?? ''
  } catch {
    id = ''
  }
  if (id === '') {
    sendJson(response, 400, { error: 'id is required' })
    return
  }
  const preview = await readPreview(ctx, id)
  if (preview === undefined) {
    sendJson(response, 404, { error: 'session-not-found' })
    return
  }
  sendJson(response, 200, preview)
}

/**
 * Read one stored Session's tail without making it live.
 *
 * The projection cache already holds the turn outline the sidebar list is built
 * from, so the common path costs one small JSON read instead of parsing a whole
 * log. A missing or stale cache falls back to reading the log from the start,
 * bounded by PREVIEW_EVENTS.
 * @param ctx - Host plugin context.
 * @param sessionId - Session to read.
 * @returns the preview payload, or undefined when the log is gone.
 */
async function readPreview(ctx, sessionId) {
  const persistence = ctx.get('sessionPersistence')
  if (typeof persistence?.stat !== 'function' || typeof persistence?.open !== 'function') return undefined
  const signal = timeoutSignal(STATE_TIMEOUT_MS)
  let snapshot
  try {
    snapshot = await persistence.stat(sessionId, { signal })
  } catch {
    return undefined
  }
  if (snapshot === undefined) return undefined
  const header = snapshot.header
  const base = {
    sessionId,
    cwd: typeof header?.cwd === 'string' ? header.cwd : '',
    createdAt: Number(header?.createdAt ?? 0) || 0,
    sizeBytes: Number(snapshot.sizeBytes ?? 0) || 0,
  }

  const turns = await readTurnOutline(ctx, sessionId, header)
  if (turns !== undefined && turns.length > 0) {
    const kept = turns.slice(-PREVIEW_TURNS)
    const items = []
    for (const turn of kept) {
      const seq = Number(turn?.seq ?? 0) || 0
      if (typeof turn?.prompt === 'string' && turn.prompt.trim() !== '') {
        items.push({ role: 'user', seq, text: clip(turn.prompt.trim()) })
      }
      if (typeof turn?.response === 'string' && turn.response.trim() !== '') {
        items.push({ role: 'assistant', seq, text: clip(turn.response.trim()) })
      }
    }
    return {
      ...base,
      turnCount: turns.length,
      items,
      truncated: turns.length > kept.length,
    }
  }

  const total = Number(snapshot.eventCount ?? 0) || 0
  let handle
  try {
    handle = await persistence.open(sessionId, 'read', { signal })
  } catch {
    return { ...base, turnCount: 0, items: [], truncated: false }
  }
  try {
    const from = Math.max(0, total - PREVIEW_EVENTS)
    let events = []
    try {
      const result = await handle.read(from, PREVIEW_EVENTS, { signal })
      events = result?.events ?? []
    } catch {
      events = []
    }
    const items = []
    for (const event of events) {
      const item = previewItemOf(event)
      if (item !== null) items.push(item)
    }
    const kept = items.slice(-PREVIEW_ITEMS)
    return {
      ...base,
      turnCount: 0,
      items: kept,
      truncated: from > 0 || items.length > kept.length,
    }
  } finally {
    try {
      await handle.close()
    } catch {}
  }
}

/**
 * Read one Session's turn outline.
 *
 * The projection cache file is the primary source: it is the same small JSON
 * this plugin already moves into the recycle bin, it costs one read, and it does
 * not depend on another plugin's in-memory table being warm. The Host service is
 * only a fallback for a cache that is not on disk yet.
 * @param ctx - Host plugin context.
 * @param sessionId - Session to describe.
 * @param header - Authoritative Session header, for the service fallback.
 * @returns the turn list, or undefined when neither source has one.
 */
async function readTurnOutline(ctx, sessionId, header) {
  const home = dshHome()
  if (home !== undefined) {
    const file = path.join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      const turns = parsed?.record?.rows?.turnOutline?.val?.turns
      if (Array.isArray(turns) && turns.length > 0) return turns
    } catch {}
  }
  return turnsFromCache(ctx, header)
}

/**
 * Read the cached turn outline through the Host projection-cache service.
 * @param ctx - Host plugin context.
 * @param header - Authoritative Session header used as the cache identity witness.
 * @returns the turn list, or undefined when no usable cached record exists.
 */
function turnsFromCache(ctx, header) {
  if (header === undefined || header === null) return undefined
  const cache = ctx.get('sessionProjectionCache')
  if (typeof cache?.cachedSnapshot !== 'function') return undefined
  let view
  try {
    view = cache.cachedSnapshot(header, ['turnOutline'])
  } catch {
    return undefined
  }
  if (view === undefined || view === null) return undefined
  const values = view.values ?? view
  const outline = values?.turnOutline
  if (outline === undefined || outline === null || !Array.isArray(outline.turns)) return undefined
  return outline.turns
}

/**
 * Shorten one previewed message.
 * @param text - Message text.
 * @returns the text, clipped to PREVIEW_CHARS.
 */
function clip(text) {
  return text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + '…' : text
}

/**
 * Reduce one durable event to a transcript row.
 * @param event - Stored session event.
 * @returns the row, or null for an event the transcript does not show.
 */
function previewItemOf(event) {
  const role =
    event?.type === 'user/message' ? 'user' : event?.type === 'assistant/message' ? 'assistant' : undefined
  if (role === undefined) return null
  const text = messageTextOf(event?.data?.message)
  if (text === '') return null
  return {
    role,
    seq: Number(event.seq ?? 0) || 0,
    text: text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + '…' : text,
  }
}

/**
 * Join the text blocks of one stored message; other block kinds stay out of the
 * transcript on purpose.
 * @param message - Stored message value.
 * @returns the joined text.
 */
function messageTextOf(message) {
  const content = message?.content
  if (Array.isArray(content)) {
    const parts = []
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text !== '') parts.push(block.text)
    }
    return parts.join('\n').trim()
  }
  if (typeof message?.text === 'string') return message.text.trim()
  return ''
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

  const skipped = results.filter((result) => result.skipped === true)
  const failed = results.filter((result) => result.ok !== true && result.skipped !== true)
  const succeeded = results.filter((result) => result.ok === true)
  const extra = {}
  if (op === 'pruneArchived') extra.pruned = results[0]?.removed ?? 0
  if (op === 'pruneOrphanCache') {
    extra.removed = results[0]?.removed ?? 0
    extra.freed = results[0]?.freed ?? 0
  }
  if (op === 'emptyTrash') {
    extra.purged = results[0]?.purged ?? 0
    extra.purgedBatches = results[0]?.purgedBatches ?? 0
    extra.purgedSessions = results[0]?.purgedSessions ?? extra.purged
  }
  if (op === 'purge') extra.purged = results[0]?.purged ?? 0
  if (op === 'restore') extra.restored = results[0]?.restored ?? 0

  sendJson(response, 200, {
    op,
    results,
    okCount: succeeded.length,
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
  if (!isInside(backups, batchDir)) return { batch, ok: false, error: 'invalid-batch-name' }

  const locateItem = (item) => {
    const sessionId = String(item?.sessionId ?? '')
    const cwdDir = String(item?.cwdDir ?? '')
    if (!isSafeSegment(sessionId) || !isSafeSegment(cwdDir)) {
      return { sessionId, error: 'invalid-batch-path' }
    }
    const source = path.join(batchDir, 'sessions', cwdDir, sessionId)
    const dest = path.join(home, 'sessions', cwdDir, sessionId)
    if (!isInside(path.join(batchDir, 'sessions'), source) || !isInside(path.join(home, 'sessions'), dest)) {
      return { sessionId, error: 'path-escape-rejected' }
    }
    let cacheSource
    let cacheDest
    if (typeof item.cacheFile === 'string' && item.cacheFile !== '') {
      if (!isSafeSegment(item.cacheFile)) return { sessionId, error: 'invalid-batch-path' }
      cacheSource = path.join(batchDir, 'projcache', item.cacheFile)
      cacheDest = path.join(home, 'storages', 'session_projcache', 'sessions', item.cacheFile)
      if (
        !isInside(path.join(batchDir, 'projcache'), cacheSource) ||
        !isInside(path.join(home, 'storages', 'session_projcache', 'sessions'), cacheDest)
      ) {
        return { sessionId, error: 'path-escape-rejected' }
      }
    }
    return { sessionId, cwdDir, source, dest, cacheSource, cacheDest }
  }

  if (!(await exists(batchDir))) return { batch, ok: false, error: 'batch-not-found' }
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
  } catch {
    // A batch may still be restorable from session trees if the manifest write failed.
    manifest = { createdAt: '', items: [] }
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    manifest = { createdAt: '', items: [] }
  }
  const catalog = classifyManifestItems(manifest.items)
  const recorded = catalog.usable
  const known = new Set(recorded.map((item) => item.sessionId))
  const discovered = await discoverBatchSessions(batchDir, known)
  const items = [
    ...recorded,
    ...discovered.map((item) => ({
      sessionId: item.sessionId,
      cwdDir: item.cwdDir,
      cacheFile: typeof item.cacheFile === 'string' ? item.cacheFile : '',
      title: item.title,
      sizeBytes: item.size,
    })),
  ]
  const wanted = sessionIds.length === 0 ? undefined : new Set(sessionIds)
  const selected = items.filter((item) => wanted === undefined || wanted.has(String(item.sessionId)))
  const selectedIds = new Set(selected.map((item) => String(item.sessionId)))
  for (const item of catalog.unsafe) {
    const sessionId = String(item.sessionId ?? '')
    if (sessionId === '' || selectedIds.has(sessionId)) continue
    if (wanted !== undefined && !wanted.has(sessionId)) continue
    selected.push(item)
    selectedIds.add(sessionId)
  }
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
      const located = locateItem(item)
      if (located.error) {
        failures.push({ sessionId: located.sessionId, error: located.error })
        continue
      }
      try {
        await rm(located.source, { recursive: true, force: true })
        if (located.cacheSource) {
          await rm(located.cacheSource, { force: true })
        }
        purgedIds.add(located.sessionId)
      } catch (error) {
        failures.push({ sessionId: located.sessionId, error: messageOf(error) })
      }
    }
    const kept = items.filter((item) => !purgedIds.has(String(item.sessionId)))
    try {
      await shrinkBatch(batchDir, manifest, items, kept)
    } catch (error) {
      failures.push({ error: 'manifest-update-failed', message: messageOf(error) })
    }
    return { batch, ok: failures.length === 0, purged: purgedIds.size, failures }
  }

  const restored = []
  const failures = []
  for (const item of selected) {
    const located = locateItem(item)
    if (located.error) {
      failures.push({ sessionId: located.sessionId, error: located.error })
      continue
    }
    try {
      const destExists = await exists(located.dest)
      const sourceExists = await exists(located.source)
      if (destExists && sourceExists) {
        failures.push({ sessionId: located.sessionId, error: 'already-exists' })
        continue
      }
      if (destExists && !sourceExists) {
        // Log already landed; finish a leftover cache if the previous attempt stopped mid-item.
        if (located.cacheSource && (await exists(located.cacheSource))) {
          if (await exists(located.cacheDest)) {
            failures.push({ sessionId: located.sessionId, error: 'already-exists' })
            continue
          }
          await mkdir(path.dirname(located.cacheDest), { recursive: true })
          await moveWithRetry(located.cacheSource, located.cacheDest)
        }
        restored.push(located.sessionId)
        continue
      }
      await mkdir(path.dirname(located.dest), { recursive: true })
      await moveWithRetry(located.source, located.dest)
      try {
        if (located.cacheSource && (await exists(located.cacheSource))) {
          await mkdir(path.dirname(located.cacheDest), { recursive: true })
          await moveWithRetry(located.cacheSource, located.cacheDest)
        }
      } catch (cacheError) {
        try {
          if (!(await exists(located.source))) {
            await mkdir(path.dirname(located.source), { recursive: true })
            await moveWithRetry(located.dest, located.source)
          }
        } catch (rollbackError) {
          failures.push({
            sessionId: located.sessionId,
            error: messageOf(cacheError),
            rollback: messageOf(rollbackError),
          })
          continue
        }
        throw cacheError
      }
      restored.push(located.sessionId)
    } catch (error) {
      failures.push({ sessionId: located.sessionId, error: messageOf(error) })
    }
  }

  const done = new Set(restored)
  const remaining = items.filter((item) => !done.has(String(item.sessionId)))
  try {
    await shrinkBatch(batchDir, manifest, items, remaining)
  } catch (error) {
    failures.push({ error: 'manifest-update-failed', message: messageOf(error) })
  }
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
  if (remaining.length === 0 && !(await batchHasLeftoverBytes(batchDir))) {
    await rm(batchDir, { recursive: true, force: true })
    return
  }
  manifest.items = remaining
  await writeFile(path.join(batchDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
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
  const failures = []
  for (const item of scan.files) {
    try {
      await rm(item.path, { force: true })
      removed += 1
      freed += item.bytes
    } catch (error) {
      failures.push({ file: item.file, error: messageOf(error) })
    }
  }
  return { ok: failures.length === 0, removed, freed, failures }
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
  let purgedBatches = 0
  let purgedSessions = 0
  const failures = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TRASH_PREFIX) || !BATCH_NAME.test(entry.name)) continue
    const batchDir = path.join(backups, entry.name)
    if (!isInside(backups, batchDir)) continue
    let count = 0
    try {
      const manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
      count = Array.isArray(manifest.items) ? manifest.items.length : 0
    } catch {
      const discovered = await discoverBatchSessions(batchDir, new Set())
      count = discovered.length
    }
    try {
      await rm(batchDir, { recursive: true, force: true })
      purgedBatches += 1
      purgedSessions += count
    } catch (error) {
      failures.push({ batch: entry.name, error: messageOf(error) })
    }
  }
  return { ok: failures.length === 0, purged: purgedSessions, purgedBatches, purgedSessions, failures }
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
  if (!isSafeSegment(sessionId)) {
    return { sessionId, ok: false, error: 'invalid-session-id' }
  }
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
    // Never delete a shared batch that already records or still holds other sessions.
    await removeBatchIfAbandoned(batchDir)
  }
  try {
    await mkdir(path.dirname(target), { recursive: true })
    testInject('move', sessionId)
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
  try {
    testInject('manifest', sessionId)
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  } catch (error) {
    manifest.items.pop()
    await rollback()
    return { sessionId, ok: false, error: 'manifest-write-failed', reason: messageOf(error) }
  }

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

  // Every open client keeps its own row cache. The Host list itself is read
  // fresh from persistence, but a client only drops a row when the Host says the
  // Session left — so say it, or the sidebar keeps showing a Session whose log
  // directory has already moved.
  try {
    ctx.emit?.('api-session/removed', sessionId)
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
      let createdAt = ''
      let manifestItems = []
      try {
        const manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
        if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
          throw new Error('manifest-not-object')
        }
        createdAt = typeof manifest.createdAt === 'string' ? manifest.createdAt : ''
        manifestItems = usableBatchItems(manifest.items).map((item) => ({
          sessionId: item.sessionId,
          cwdDir: item.cwdDir,
          title: item.title,
          size: item.sizeBytes,
        }))
      } catch {
        // Manifest missing or unreadable: fall back to scanning session trees.
      }
      const known = new Set(manifestItems.map((item) => item.sessionId))
      const rows = [...manifestItems, ...(await discoverBatchSessions(batchDir, known))]
      if (rows.length === 0) continue
      batches.push({
        batch: entry.name,
        createdAt,
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
 * Whether a path segment is a single, non-traversing name.
 * @param name - Candidate segment.
 * @returns true when the name is safe to join under a known root.
 */
function isSafeSegment(name) {
  if (typeof name !== 'string' || name === '') return false
  if (name === '.' || name === '..') return false
  if (/[\\/\0]/.test(name)) return false
  if (path.isAbsolute(name) || path.win32.isAbsolute(name) || path.posix.isAbsolute(name)) return false
  return true
}

/**
 * Whether `target` resolves strictly inside `root`.
 * @param root - Absolute root directory.
 * @param target - Absolute candidate path.
 * @returns true when target is a descendant of root.
 */
function isInside(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string' || root === '' || target === '') return false
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(target)
  const relative = path.relative(rootResolved, targetResolved)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Test-only fault injection; inert unless DSHSC_TEST_HOOKS=1.
 * @param kind - move | manifest
 * @param sessionId - Target Session.
 */
function testInject(kind, sessionId) {
  if (process.env.DSHSC_TEST_HOOKS !== '1') return
  if (kind === 'move' && process.env.DSHSC_FAIL_MOVE === sessionId) throw new Error('injected-move-failure')
  if (kind === 'manifest' && process.env.DSHSC_FAIL_MANIFEST === sessionId) {
    throw new Error('injected-manifest-failure')
  }
}

/**
 * Remove a trash batch directory only when it holds no recorded or leftover sessions.
 * @param batchDir - Absolute batch directory.
 */
async function removeBatchIfAbandoned(batchDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
    if (Array.isArray(manifest.items) && manifest.items.length > 0) return
  } catch {
    // Missing or unreadable manifest: only drop the folder when no session trees remain.
  }
  if (await batchHasLeftoverBytes(batchDir)) return
  try {
    await rm(batchDir, { recursive: true, force: true })
  } catch {}
}


/**
 * Split manifest entries into path-safe catalog items and illegal records.
 * Illegal records are retained only so a requested restore/purge can still
 * report a path error; they never enter `known` and cannot hide a real tree.
 * @param items - Raw manifest items.
 * @returns `{ usable, unsafe }` catalog partitions.
 */
function classifyManifestItems(items) {
  const usable = []
  const unsafe = []
  if (!Array.isArray(items)) return { usable, unsafe }
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const sessionId = String(item.sessionId ?? '')
    const cwdDir = String(item.cwdDir ?? '')
    if (!isSafeSegment(sessionId) || !isSafeSegment(cwdDir)) {
      unsafe.push(item)
      continue
    }
    const cacheFile = typeof item.cacheFile === 'string' ? item.cacheFile : ''
    if (cacheFile !== '' && !isSafeSegment(cacheFile)) {
      unsafe.push(item)
      continue
    }
    usable.push({
      sessionId,
      cwdDir,
      cacheFile,
      title: typeof item.title === 'string' ? item.title : '',
      sizeBytes: Number(item.sizeBytes ?? 0) || 0,
    })
  }
  return { usable, unsafe }
}

/**
 * Keep only manifest entries whose session and cwd segments are safe to join.
 * @param items - Raw manifest items.
 * @returns usable catalog entries.
 */
function usableBatchItems(items) {
  return classifyManifestItems(items).usable
}

/**
 * Whether a batch still holds session trees or leftover projection-cache files.
 * @param batchDir - Absolute batch directory.
 * @returns true when deleting the folder would destroy unrestored bytes.
 */
async function batchHasLeftoverBytes(batchDir) {
  if (await hasSessionTrees(path.join(batchDir, 'sessions'))) return true
  const cacheRoot = path.join(batchDir, 'projcache')
  let entries
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true })
  } catch {
    return false
  }
  return entries.some((entry) => entry.isFile() && isSafeSegment(entry.name))
}

/**
 * Whether a batch still has session directories on disk.
 * @param sessionsRoot - Absolute `sessions` directory inside a batch.
 * @returns true when at least one session directory exists.
 */
async function hasSessionTrees(sessionsRoot) {
  let groups
  try {
    groups = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return false
  }
  for (const group of groups) {
    if (!group.isDirectory() || !isSafeSegment(group.name)) continue
    let inner
    try {
      inner = await readdir(path.join(sessionsRoot, group.name), { withFileTypes: true })
    } catch {
      continue
    }
    if (inner.some((entry) => entry.isDirectory() && isSafeSegment(entry.name))) return true
  }
  return false
}

/**
 * Scan a batch folder for session directories not listed in the manifest.
 * @param batchDir - Absolute batch directory.
 * @param knownIds - Session ids already taken from the manifest.
 * @returns discovered items that can still be restored.
 */
async function discoverBatchSessions(batchDir, knownIds) {
  const found = []
  const sessionsRoot = path.join(batchDir, 'sessions')
  let groups
  try {
    groups = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return found
  }
  for (const group of groups) {
    if (!group.isDirectory() || !isSafeSegment(group.name)) continue
    let inner
    try {
      inner = await readdir(path.join(sessionsRoot, group.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of inner) {
      if (!entry.isDirectory() || !isSafeSegment(entry.name) || knownIds.has(entry.name)) continue
      const folder = path.join(sessionsRoot, group.name, entry.name)
      const cacheFile = `${entry.name}.json`
      const cacheSource = path.join(batchDir, 'projcache', cacheFile)
      const item = {
        sessionId: entry.name,
        cwdDir: group.name,
        title: '',
        size: await directoryBytes(folder),
        recovered: true,
      }
      if (
        isSafeSegment(cacheFile) &&
        isInside(path.join(batchDir, 'projcache'), cacheSource) &&
        (await exists(cacheSource))
      ) {
        item.cacheFile = cacheFile
      }
      found.push(item)
    }
  }
  return found
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
