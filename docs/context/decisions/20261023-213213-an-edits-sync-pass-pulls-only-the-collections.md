# Scope decisions — An edit's sync pass pulls only the collections it touched (issue #4896)

_Recorded 2026-10-23 · issue #4896._

- **A mutation site names the synced collections it wrote, and the pass it
  schedules pulls and pushes only those.** One Overview reload ran three full
  passes in 12 s (boot, the mining tax snapshot's write, the rerun that write
  earned mid-pass), about 140 Firestore reads, re-pulling 14 collections that
  could not have changed locally and whose remote side was pulled seconds
  before. Coalesced requests union their sets; the one-more-pass rerun keeps
  only what the mid-pass writes touched.
- **A narrowed pass still pulls every collection it pushes.** Last-write-wins
  (`merge.ts`) needs the remote copy in hand, so narrowing skips whole
  collections, never the pull of one it writes. This rules out a push-only
  pass.
- **Anything without a set is a full pass, and a full request wins any merge.**
  Boot, Character switch, reconnect, the background sweep, `triggerSync` and
  any caller that is unsure. Unmapped is safe, so a caller is only mapped when
  what it writes is plain.
- **A narrowed request stays narrowed only within `PARTIAL_PASS_WINDOW_MS`
  (5 min) of the start of the last successful full pass on this page.** Older,
  or none yet, and it runs full. Five minutes is the background sweep's gap for
  the active Character, so an untouched collection is never staler than an
  idle tab already allows. The sweep gates on the new `lastFullSyncAt`, not
  `lastSyncedAt`, so steady editing cannot keep postponing it. An ownerHash
  change also forces a full pass, since its wipe empties every collection, and
  so does any failed pass: a narrowed success on another collection must not
  clear the error while the failed one stays unsynced.
- **A narrowed pass writes no heartbeat and leaves every other collection's
  pull cursor alone.** The heartbeat means "every collection synced"
  (`purgeStaleAccounts`); the sweep and a full pass within the day still stamp
  it.
- **Settings stay a full read.** Giving them a pull cursor (`mergeSettings`
  to windowed semantics) needs a two-phase rollout, because dev and production
  share Firestore. It is out of scope here.
