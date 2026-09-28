# Scope decisions — Multi-tab leadership: one visible tab runs background work

_Recorded 2026-09-28._

- **One visible tab — the Tab Leader — runs the Foreground Poller and the
  background sync sweep; the other tabs skip them.** Every open tab used to run
  both, so N tabs polled ESI and minted Firebase tokens N times for the same
  data. Leadership is a held Web Lock (`neocom:leader`, `src/lib/tabLeader.ts`).
  Rules out electing a hidden tab: both jobs skip while hidden, so a hidden
  leader would mean nobody works. A tab requests the lock only while visible and
  gives it up (or drops its queued request) on becoming hidden and on
  `pagehide`; a closed tab's lock is released by the browser. With every tab
  hidden nobody leads — the same as each tab's own hidden behaviour before.
- **A tab taking leadership over catches up at once, but never before its boot
  hold-off (#2234).** The lock is granted asynchronously, after the
  `visibilitychange` that asked for it, so each job also listens for the
  leadership change; winning the election at boot still waits out the 10 s
  delay.
- **Without Web Locks every tab is leader.** No election, no change events —
  exactly the pre-election behaviour. Rules out a `BroadcastChannel`/storage
  heartbeat fallback: more moving parts for the few browsers lacking Web Locks.
- **Not elected:** cache prefetch/warm-up (it warms _this_ tab's view), the
  active Character's boot/switch sync and per-mutation syncs (they serve the
  tab the user is acting in).
- **Token refresh is serialised across tabs with a per-Character Web Lock
  (`neocom:refresh:<id>`), not elected.** Any tab may need a token at any time;
  the lock holder re-reads the token row, so a tab that waited finds it already
  refreshed. EVE's docs
  (https://docs.esi.evetech.net/docs/sso/refreshing_access_tokens.html) say the
  returned refresh token "may not be the same" and that rotation is coming for
  native (PKCE) clients, without saying whether the old token dies on use — so
  concurrent refreshes may or may not cost an `invalid_grant` re-login; the lock
  removes the question and the duplicate round trip either way.
