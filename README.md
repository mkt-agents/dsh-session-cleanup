# dsh-session-cleanup

A DeepSeek Harness (DSH) Web plugin that adds a **session cleanup** panel to the sidebar: list sessions by
size, archive them, delete them into an **undoable recycle bin**, and clear orphaned projection cache.

DSH has no session-delete capability (removing a Workspace registration deliberately leaves session
histories in place). This plugin owns the missing operations.

## Features

- **Size-sorted session list** — every session grouped by workspace, with byte size, last-updated time, and
  a live/running badge.
- **Archive / unarchive** — delegates to `workspaceRegistry.archiveSession` so archived sessions stay out of
  the active list without touching bytes.
- **Reversible delete** — a deleted session directory *and* its projection-cache file are **moved** into
  `$DSH_HOME/backups/session-cleanup-<stamp>/` with a manifest. Nothing is destroyed.
- **Per-session or per-batch restore** — undo a whole delete action, or bring back a single session of it.
- **Explicit purge** — the only operation that removes bytes, requested per batch or per session.
- **Empty trash** — drop every `session-cleanup-*` batch at once.
- **Orphan cache cleanup** — remove `session_projcache/sessions/*.json` files whose session log is gone,
  reporting the freed bytes.
- **Stale archive pruning** — drop archive/pin entries whose session log no longer exists.

## Safety model

- A session still attached to a live Agent owns its log writer, so it is **skipped** rather than moved.
- Nothing outside `$DSH_HOME/sessions` is ever moved; nothing outside `$DSH_HOME/backups` is ever removed.
- Moves are rollback-safe: a failed delete restores what it already moved and drops the partial batch.
- Cross-volume moves fall back to copy-then-remove (`EXDEV`).
- Both routes reject cross-site writes (`sec-fetch-site` / `Origin` vs `Host`) and wrong methods.
- Request bodies are bounded to 64 KiB; labels are truncated to 200 characters.

## Install

Copy the plugin directory into your DSH profile's plugin folder, or install it as a bundle. The bundle patch
is `cordis.patch.yml`:

```yaml
- insert:
    - id: session-cleanup
      name: '@local/dsh-session-cleanup'
      inject: [webServer]
      config: {}
```

`package.json` declares the client half as an immediately-injected web client with `react`,
`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-locale`, and `@deepseek-ai/dsh-client-ui-slots`.

## Host routes

Same-origin only.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dsh-session-cleanup/state` | workspaces, archive/pin sets, sessions, trash, stats |
| `POST` | `/dsh-session-cleanup/action` | `archive` \| `unarchive` \| `delete` \| `restore` \| `purge` \| `pruneArchived` \| `pruneOrphanCache` \| `emptyTrash` |

`action` accepts `{ op, sessionIds?, batch?, labels? }`. `restore` and `purge` require `batch`; an empty
`sessionIds` applies to the whole batch. One delete action becomes one trash batch, so a bulk delete undoes
as a unit.

## Layout

```
index.js            Host half: routes, trash batches, orphan scan
client.js           Client half: main panel + sidebar entry
cordis.patch.yml    Bundle patch
locale/{en,zh}.json Plugin metadata strings
icon.svg            Sidebar icon
test/host.test.mjs  Host route tests (28 assertions)
test/client.test.mjs Client render tests (38 assertions)
```

## Tests

```bash
npm test
```

Both suites run on plain Node with no dependencies: the host suite drives the real route handlers against a
temporary `DSH_HOME`, and the client suite executes the component tree through a minimal hook runtime.

## Notes

- The plugin id is `@local/dsh-session-cleanup`; rename it if you publish under a scope.
- Deleted batches live under `$DSH_HOME/backups`, which is outside the sessions tree, so DSH never
  re-indexes them. Purge them when you are sure.
- `DSH_HOME` defaults to `%USERPROFILE%\.dsh` on Windows and `$HOME/.dsh` elsewhere.

## License

MIT
