# Scope decisions — game constants past their window serve stale silently

_Recorded 2026-09-28._

- **A lapsed game constant is served at once and refreshed behind the caller,
  without the revalidation signal.** Amends "a game constant still does not"
  in `20260912-160012-each-contract-search-board-loads-on-its-own.md`. That
  refusal existed because stale-serve _signals_ (`onCacheRevalidated`), and
  re-running every mounted route per distinct location to show the same
  station name is all cost. But refusing meant the opposite cost: after a day
  away every station, structure, system, public-info, contract-item and
  mail-body lookup had lapsed at once and each blocked on ESI. A key on
  `STALE_AFTER.static` (or longer) without `allowStaleServe` now returns its
  stored row with no grace wait, refreshes through the usual in-flight dedupe,
  and emits nothing — the refreshed row is simply there for the next read.

- **The honesty rule still holds, one read late.** A refresh that fails is
  recorded like any other failed revalidation, so the next read gets the row
  flagged `fromCache` (what the old blocking path returned for a failed call)
  and does not start another call inside the backoff. It just does not wake a
  mounted route to say so, since the row it shows is the same one.

- **Only constants.** A window between `STALE_AFTER.default` and a day with no
  opt-in (the synced public BPC snapshot's 30 minutes) still blocks on the
  live call, and a loader with `skipCacheOnAuthFailure` never takes the silent
  path — it must not be shown a row its Character may no longer be entitled to.
