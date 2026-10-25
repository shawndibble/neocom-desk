# Scope decisions — Synced settings read incrementally too (issue #5045)

_Recorded 2026-10-24 · issue #5045._

- **Synced settings use the same Pull Cursor as every other remote collection.**
  This supersedes the "settings stays a full read" bullet of
  `20260907-220630-sync-reads-incrementally-with-a-periodic-full-reconcile.md`:
  measured, the settings scan was the second-largest Firestore read source
  (~10k reads), because it ran on every full pass at ~15 docs each. A pass with
  no settings changes now costs one read.
- **A local settings tombstone with no remote doc in the window is pushed only
  when it postdates the cursor.** `mergeRecords` pushes on any windowed absence,
  but settings tombstones never expire, so the same rule would rewrite every
  deleted key on every pass forever. At or below the cursor, the pass that last
  saw the tombstone either pushed it or saw the remote one. It is still never
  _cleared_ on absence. This rules out sharing `mergeRecords`' rule.
- **An unstamped synced value forces a full read.** `useSyncedSetting`'s legacy
  seed is written with no LWW stamp so that any remote copy wins; a window cannot
  show whether a remote copy exists, so pushing it would clobber one. Forcing a
  full read for that pass keeps the old behaviour exactly; it is a one-off,
  since the pass stamps what it pushes.
- **The cursor stays put when the apply drops a pulled doc** because a local
  write landed mid-pass. Advancing past the doc would hide it from every later
  window; the next pass re-reads the same one instead.
- **Accepted edge, shared with every cursored collection:** a write stamped
  below another device's cursor (an edit made offline, or under a slow clock)
  reaches that device on its next full reconcile, at most 30 days later, not
  on its next pass.
