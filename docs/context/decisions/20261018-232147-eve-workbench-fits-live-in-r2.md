# Scope decisions — EVE Workbench fits live in R2, not Firestore (issue #4271)

_Recorded 2026-10-18 · issue #4271. Applies ADR 0019 to one more public
dataset; supersedes the storage (not the sync design) of
`20261003-165853-keep-our-own-copy-of-eve-workbench-public.md` and
`20261003-191214-read-eve-workbench-fits-by-id-and-deny.md`. The mining price
history (`marketHistory`) was dropped from this issue: it is being retired
separately, folded into the open-prices job._

- **One gzip object per hull, `workbench-fits/<shipTypeId>.json`**, body
  `{ shipTypeId, fits }`, every stored fit for the hull, newest first. A hull is
  what the Popular fits panel reads, so a hull is what it downloads; the old
  `{shipTypeId}_{part}` split existed only for Firestore's 1 MiB document limit
  and is gone (`splitHullParts`, `planHullWrite`, the `parts` count). The client
  (`features/fittings/workbenchFits.ts`) fetches the object from
  `R2_SNAPSHOT_ORIGIN` with no Firebase session; a 404 (the sync hasn't reached
  the hull, or it has no public fits) reads as no fits, not a failure.
- **Read by hull id, no listing:** public reads go only through the custom
  domain `data.neocomdesk.com` (ADR 0019; `r2.dev` is not used). A Cloudflare
  custom domain serves an object by its key and has no bucket-listing endpoint
  (listing is an S3 API call that needs the bucket's credentials), so nobody
  pages through all ~38k fits. That is the guarantee the old get-only,
  deny-list rule gave.
- **`Cache-Control: public, max-age=21600`.** The sync runs every 12 hours and a
  hull only changes when it gains fits; six hours of edge staleness is invisible
  on a list of community fits.
- **Changed-only writes.** A run reads each hull it collected fits for, merges,
  and writes the object only when the merge changed it (`runWorkbenchSync`'s
  `hullsWritten`). A resumed page that re-sees stored fits costs a read, not a
  write.
- **The checkpoint stays in Firestore**, `workbenchFitsSync/state`, admin-only
  (no client rule). It is one small doc read and written once a run; moving it
  to R2 would put sync bookkeeping on a public bucket for no saving.
- **Migration, no maintainer script.** The issue assumed fits are re-fetched in
  full every sync; they are not — the sync is incremental and its checkpoint
  stops each pass at fits it already stored, so an empty bucket would never be
  refilled. The first run after deploy therefore copies the Firestore
  `workbenchFits` collection into R2 (`functions/src/workbenchFitsMigration.ts`,
  merged with anything R2 already holds) and does nothing else; it then sets
  `workbenchFitsSync/r2Migration`, and every later run skips the copy without
  reading Firestore. The legacy docs are streamed 20 at a time in `shipTypeId`
  order, so the run holds a page and the hulls in flight, not all ~38k fits. A
  failed write throws before the flag is set, so the next run retries; the merge
  makes that safe. The module and the flag go once the collection is deleted. (Since removed, #4293.)
- **Deploy before the client ships.** CI deploys only the app; functions are
  deployed by hand. The client reads R2 the moment the app deploys and reads a
  missing hull object as no fits, so until the function is deployed and its
  migration run has landed, the EVE Workbench tab shows no fits for every hull.
  Deploy `syncWorkbenchFits` (and run it once) before or right after merging.
- **Operation budget:** the migration is one Class B read and one Class A write
  per hull, once (a few hundred to ~1,000 hulls). Steady state is the hulls that
  gained fits each run — tens per run, 60 runs a month, so on the order of
  1,000–3,000 Class A writes a month against R2's free 1M, shared with the
  contract and open-price publishers (~600k a month for open prices alone).
- **Bucket rule:** `workbench-fits/` is mutable and must stay outside the
  lifecycle rule that expires superseded contract objects (which is scoped to
  `contract-offers/` and `courier-contracts/`).
- **Firestore rules and data:** the `workbenchFits` rule is removed (the
  implicit deny covers the stale collection until it is deleted).
  `workbenchFitsSync` keeps its admin-only docs. No client fallback to
  Firestore.
