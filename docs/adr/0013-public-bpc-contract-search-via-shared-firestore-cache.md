# 0013 — Public BPC contract search reads a shared, admin-write-only Firestore cache fed by a scheduled fetch of EVE Ref's public-contracts dataset

## Status

Accepted (2026-09-08)

## Context

Issue #608: let a user search the _public_ EVE contract market for Blueprint
Copies (BPCs) by item type, region, ME/TE, runs and price, the way other
third-party EVE tools already do. ESI has no server-side search for this —
`/contracts/public/{region_id}/` and `/contracts/public/items/{contract_id}/`
only, no filter parameter (confirmed against the live swagger and the
"Access to public contracts via ESI - search by type_id?" forum thread,
2026-09-08) — so any such feature has to crawl every region's public
contracts and their items itself, or lean on someone who already does.

[EVE Ref](https://data.everef.net) already does: `data.everef.net`'s
`public-contracts-latest.v2.tar.bz2` is a twice-hourly, whole-galaxy scrape of
every public contract and its items, published as CSV, with `is_blueprint_copy`,
`material_efficiency`, `time_efficiency` and `runs` right on each item row —
the Fuzzwork-for-market-prices equivalent for contracts (ADR 0002's precedent).
It carries no `Access-Control-Allow-Origin` header, though (verified
2026-09-08), so this SPA cannot `fetch()` it directly — a backend has to fetch,
filter, and republish a small result for the client.

Verified against a live pull (2026-09-08, `datasource: tranquility`): ~50,300
public contracts total (48,963 item_exchange, 717 auction, the rest courier),
joined against 353,059 contract-item rows down to 122,717 blueprint-copy rows
offered for sale (`is_blueprint_copy = true`, `is_included = true`) across
23,051 distinct contracts, once contracts that had already lapsed by the join
time are dropped. `contracts.csv` carries no `status` column at all — ESI's
public-contracts endpoint only ever lists outstanding contracts, so every row
is already one.

This project already runs on Firebase Blaze (two existing `onSchedule`
functions: `dispatchProjections` every 5 minutes, `purgeNotificationFeed`
daily), so a third scheduled job costs at most one more Cloud Scheduler job
(3 are free per billing account) plus whatever Firestore writes it makes.
That second part is where this needs deliberate design: `docs/ARCHITECTURE.md`
states Firebase exists **only** for per-character sync data ("not a general
backend... Nothing else" for external dependencies), and every Firestore rule
today is scoped under `characters/{uid}/...`. Writing one document per
BPC-bearing contract (23k+) every 30 minutes would both blow well past
Firestore's 20,000-free-writes/day quota and be the app's first shared,
non-per-character collection — a real amendment to that boundary, not a
routine addition, so it gets its own ADR rather than a scope decision.

## Decision

A new scheduled Cloud Function, `syncPublicBpcContracts` (every 30 minutes,
matching EVE Ref's cadence), fetches and decompresses the archive
(`unbzip2-stream` + `tar-stream`, both pure-JS, no native bindings — safe for
Cloud Functions), parses `contracts.csv` and `contract_items.csv`
(`csv-parse`), joins and filters them down to blueprint-copy rows offered for
sale on an item_exchange/auction contract not yet expired, and writes the
result as a **wholesale-replaced, chunked** snapshot: ~2,000 rows per chunk
document (well under Firestore's 1MiB limit — the 2026-09-08 pull's 122,717
rows chunked to 62 documents, largest ~383KB), plus one `meta` document
recording `lastSyncedAt`/`chunkCount`/`rowCount`. 62 chunk writes + 1 meta
write per run, ~48 runs/day, is ~3,000 writes/day — comfortably inside the
free tier, nowhere near the one-doc-per-contract approach's ~1.1M/day.

The collection, `publicBpcContracts`, is the app's first top-level,
non-per-character Firestore collection: admin-write-only (the function uses
the Admin SDK, which bypasses rules entirely — same pattern as
`projections`/`deviceRegistrations`, ADR 0010), readable by any signed-in
client (`request.auth != null`), because the underlying data — EVE's public
contract market — has no owner or Character to scope it to. Reading still
requires a live Firebase Auth session, which `ensureSignedIn` already
establishes on every character switch for the sync feature proper (ADR 0001)
— this reuses that session rather than adding a second auth path. **This is
the one narrow, explicit exception to "Firebase is per-character sync only";
`docs/ARCHITECTURE.md` is updated alongside this ADR to name it, not to
retract the general rule.**

The client reads the collection through `esi/cache.ts`'s
`GLOBAL_CACHE_CHARACTER_ID` sentinel — the same trade `stations.ts` and the
new `regionNames.ts` make for other character-independent public lookups —
which gets Dexie-backed offline caching and the app's usual Refresh affordance
for free, even though the "live" fetch here is Firestore rather than ESI.

## Considered Options

- **One Firestore document per BPC-bearing contract (rejected).** The
  straightforward mapping, but at real scale (23k+ contracts, growing) it
  both exceeds the free write quota by 50x and requires a second query
  pattern (`where` on type/region) this feature doesn't otherwise need,
  since the client already downloads and filters the whole small snapshot
  client-side.
- **Firebase Cloud Storage instead of Firestore (rejected, but close).** A
  single public JSON blob avoids Firestore entirely, staying even further
  from the "Firestore is sync-only" boundary. Rejected once the chunked
  design above showed Firestore's write/read cost at real scale is already
  negligible (~3,000 writes/day, ~63 reads per client session) — the
  simplicity of one storage product, one read API
  (`firebase/firestore/lite`), already used everywhere else in `src/sync`,
  won out over a marginal boundary-purity gain.
- **Crawl ESI's own `/contracts/public/{region_id}/` directly (rejected).**
  ~113 regions, each independently paginated, on top of one
  `/contracts/public/items/{contract_id}/` call per contract worth
  inspecting — thousands of ESI requests per sync, against a shared,
  per-client-id error-limit budget this app does not want to spend on a
  crawl EVE Ref already runs. Also reproduces infrastructure (a scraper)
  that already exists and is kept current by someone else.

## Consequences

- **A new external dependency**: `data.everef.net`, alongside
  `esi.evetech.net`, `login.eveonline.com`, `market.fuzzwork.co.uk` and
  Firebase in `docs/ARCHITECTURE.md`'s list. If EVE Ref stops publishing this
  dataset, the feature goes stale (the last-synced snapshot keeps being
  served) rather than failing outright, same posture ADR 0002 accepted for
  Fuzzwork.
- **Firebase is no longer purely "sync my own Character's data."** One
  collection, admin-write-only, holding public market data with no owner —
  narrow and explicit, but a real precedent the next such feature can point
  to instead of re-litigating.
- **No EVE token is newly at risk.** The scheduled function holds no EVE
  token and makes no ESI call at all (mirrors ADR 0010's core promise, just
  for a different reason: this data source is EVE Ref, not ESI).
- **Scope cuts, both fast-followable, not architectural:** the table shows a
  row's **region**, not its exact station/structure — resolving
  `locationId` the way `contractLocationName.ts` does for personal contracts
  is deferred rather than fanning out a lookup per visible row on first cut.
  Contract **title** (free text sellers write ME/TE/run notes into) is not
  searched — structured filters (type, region, ME/TE, runs, price) cover the
  same ground without parsing arbitrary, mixed-language, occasionally
  ASCII-art text.
- **The whole feature is unavailable wherever Firebase sync isn't
  configured** (`isSyncConfigured()` false) — same as every other
  Firebase-backed feature, made explicit in the route's empty state rather
  than silently rendering nothing.
