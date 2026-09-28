# Scope decisions — Background sweep ends on the active Character and yields to edits

_Recorded 2026-09-28._

Refines `20260912-125743-alert-dismissals-push-on-dismiss-a-visible-tab.md`.

- **Characters other than the active one are swept on a 20-minute gap, not 5.** `app/backgroundSync.ts`'s `BACKGROUND_SYNC_NON_ACTIVE_GAP_MS`. Nobody is
  looking through them, and each one costs a `mintFirebaseToken` call plus a
  swap of the one Firebase session. So an alt's alert dismissed on another
  device can take up to about 20 minutes to clear here. The active Character
  keeps `BACKGROUND_SYNC_MIN_GAP_MS`.
- **The sweep queues the active Character last, and adds it whenever any
  other Character is swept, even inside its own gap.** `ensureSignedIn` leaves
  the session on whoever synced last. If the sweep ended on an alt, the next
  edit would re-mint the active Character's token. That costs one extra
  incremental pass of the active Character (reads only, mostly empty) per alt
  sweep.
- **Sweep syncs run at background priority and edits overtake them.**
  `sync/planSync.ts`'s `SyncPriority`: syncs are still one at a time globally,
  because the session is one slot. But a queued foreground sync (an edit, the
  boot sync, a Character switch) starts before any queued background one. So an
  edit waits for at most the one sync already in flight, not for the whole
  N-Character sweep. A foreground request for a Character whose background sync
  is still queued promotes that sync rather than queueing a second one.
- **"Ends on the active Character" is best-effort, not a guarantee.** The
  session can still end on an alt in two cases:
  - An edit promotes the active Character's queued sweep sync. It then runs
    ahead of the alts still queued, which is deliberate: edit latency matters
    more than where the session ends.
  - The active Character is already syncing when the sweep fires. The sweep
    skips it, and the alts queue behind it.

  Either way, the next sync of the active Character re-mints its token. Every
  sweep costs one token mint per Character it syncs, which counts the
  appended active Character after any alt.

- **A request that arrives while a Character's sync is running gets one more
  pass.** It does not just await the pass in flight, which may already have
  read the local rows before the edit. The caller's promise settles only after
  that extra pass. `flushSync` relies on this before removing a Character's
  rows. Syncs still queued when `haltSync` runs are skipped, not run.
