# Scope decisions — Keep our own copy of EVE Workbench public fits, grouped by hull (issue #2484)

_Recorded 2026-10-03 · issue #2484._

- **We keep our own copy of EVE Workbench's public fits, grouped by hull, in
  Firestore (`workbenchFits`).** Workbench's public list
  (`GET /v1/fits/public?page=N`) is newest first, 100 a page, ~38k fits, and has
  no hull filter — the `typeId`/`shipId`/`tags` parameters in the old devblog
  docs are ignored now. Its API also sends no CORS headers. So the browser can't
  ask it for "this hull's fits" at all; a scheduled Cloud Function
  (`syncWorkbenchFits`, every 30 minutes) walks the list and stores each fit's
  summary and EFT by hull instead. This rules out a client-side Workbench call
  and an on-demand per-hull proxy (which would still have to walk every page).
- **The first walk is spread over many runs; later runs stop at the first
  stored fit.** ~38k EFT fetches can't fit one 540s invocation at a polite
  ≤ 4 requests/s, so a pass is checkpointed in `workbenchFitsSync/state` and
  resumed — about 15 hours to backfill, then a page or so per run. Workbench ids
  are GUIDs, so "already stored" is the previous pass's newest ids or anything
  not newer than its newest date.
- **A hull too big for one document is split across `{shipTypeId}_{part}` docs**
  under a ~900KB budget; the client reads them all with one `shipTypeId` query.
- **`workbenchFits` is readable with no Firebase session** — a first for this
  project's public collections. The data is Workbench's own public list, and
  the fitter works logged out. Writes stay admin-only; the sync state has no
  rule and stays denied.
- **No Workbench API key.** Nothing here needs one; the owner's key is left out.
- **One more Cloud Scheduler job** past the free three, the same trade
  `captureMiningPriceSnapshot` made.
