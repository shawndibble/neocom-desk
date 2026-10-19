# 0019 — The public-contract snapshots are served from Cloudflare R2 as per-type files, not read whole from Firestore

## Status

Proposed (2026-10-14). The Firestore fallback clause below is superseded: R2 is
the only store since issue #4270 (decision
`20261018-233253-public-contract-snapshots-are-served-from-r2-only`).

## Context

ADR 0013 put the Public Contract Offers snapshot in Firestore as ~124 chunk
docs of up to 3,000 rows each, republished by `syncPublicContractOffers`. Item
search can already answer one type's query from only the chunks the #2921 index
names while the rest is still downloading, but the full download still runs, and
every other consumer reads the whole collection. The Public Courier Contracts
snapshot (a sibling) does the same.

The October 2026 GCP bill shows what that costs. Oct 1–14 was $2.42, all of it
Firestore (Google files the SKUs under the "App Engine" service name): 22 GiB
of internet egress to the Americas ($1.44), 17.3 GiB to Europe ($0.88), 749k
read ops ($0.10). Cloud Run Functions compute was covered by the free tier;
writes were free. The spend began Oct 6–7, the day the type-sorted offers
snapshot and index (#2921) shipped.

Why the egress is that large, from reading `origin/main`:

- A full read is roughly 40–75 MB (≈370k rows at ~100–210 B, ADR 0013's sizing).
- Each consumer reads it independently, with its own cache: Item search
  (`publicContractOffers.ts`), BPC Sourcing and Blueprint Acquisition
  (`syncedContracts.ts`, `getDocs` over the whole collection), and the
  market-wide opportunities scan (`blueprintSourceSets.ts`).
- A stale cache entry (30 minutes) refetches every chunk without comparing the
  tiny `meta` doc's `lastSyncedAt` first, so byte-identical snapshots are
  downloaded again. Since Oct 8 the backend skips unchanged EVE Ref archives,
  which makes such repeats more likely.

Cost therefore scales with users × downloads, not with what anyone searches
for. At ~$0.065/GB and two full reads a day per user (40–75 MB each, ≈3.6 GB a
user a month at 60 MB), 100 daily users is ≈$23/month and 1,000 is ≈$160–290/month
(an estimate, not a measurement; the read frequency is assumed).

Alternatives considered for _where_ to serve it are under Considered Options.

## Decision

Publish the offers snapshot (and later the courier snapshot) to a Cloudflare R2
bucket, served from `https://data.neocomdesk.com`, as **per-item-type files**
plus a small index, and have the client fetch only the types a search needs.

- **Bucket:** `neocom-snapshots`; public reads through the custom domain
  `data.neocomdesk.com` (not `r2.dev`, which Cloudflare documents as
  rate-limited and for development only). CORS allows `https://neocomdesk.com`,
  `https://dev.neocomdesk.com` and the local dev origins, with GET only. A
  missing origin is silent: the client reads the blocked fetch as "no snapshot"
  (the price history draws its average line labelled "no order data").
- **Layout:** `contract-offers/index.json` (the `lastSyncedAt` stamp, each
  type's count, cheapest ask and object name, and the region list — what
  `publicContractOfferIndex.ts` carries today) and one object per type,
  `contract-offers/types/<typeId>.<contentHash>.json`. A type that outgrows a
  sensible object size is split by region and listed as several objects in the
  index.
- **Content-addressed type objects.** The writer hashes each type's rows and
  uploads only the objects whose hash changed; the index names the current hash
  per type. Because a client reads the index first and then exactly the objects
  it names, a half-old, half-new snapshot cannot be assembled — the problem
  `readChunks`' `mixed` retry exists to patch today. Objects are uploaded
  gzip-encoded (`Content-Encoding: gzip`) and are immutable
  (`Cache-Control: public, max-age=31536000, immutable`); `index.json` is
  short-lived (`max-age=60`). An R2 lifecycle rule deletes objects older than a
  few days so superseded hashes do not accumulate.
- **Writer:** `syncPublicContractOffers` uploads through R2's S3-compatible API
  after the existing archive-unchanged skip. Credentials are Firebase secrets
  `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`; `R2_ENDPOINT`, `R2_BUCKET` and
  `R2_PUBLIC_BASE_URL` are plain env in `functions/.env`. No credential reaches
  the client.
- **Reader:** a loader that fetches `index.json`, then only the type objects a
  search names. The full-snapshot consumers (BPC Sourcing, Blueprint
  Acquisition, market-wide scan) read the types they actually use, through the
  index, instead of `getDocs` over every chunk. The Firestore chunks remain
  as the fallback until the R2 path has run in production, then are deleted.
- **Ahead of all of it,** and independent of R2: compare `meta.lastSyncedAt`
  with the cached copy and skip the chunk reads when they match. This stops
  the repeat downloads on the existing path and keeps doing so for whatever
  still falls back to it.

## Considered Options

- **Firestore doc per offer, queried.** Rejected. ~370k docs republished up to
  48 times a day is writes billed per document (≈$0.18/100k, with a 20k/day
  free allowance shared by the whole project); even writing only changed rows
  is tens of dollars a month at 10% churn. It also cannot express the filters:
  no substring search, one range field per query, a composite index per filter
  combination, and jump distance is relative to the user's location.
- **Per-type docs in Firestore.** Viable and cheaper than the above — one read
  per searched type, only changed types rewritten — but it keeps the cost
  proportional to Firestore's per-doc and per-GB prices, and its writes draw on
  the project's 20k/day free allowance that `dispatchProjections` and the
  syncs already share. R2 has no egress fee and its operation prices are lower.
- **Search endpoint (Cloud Run function) holding the snapshot in memory.**
  Rejected for now: tiny responses, but it needs a warm instance or a 60 MB
  load on every cold start, and it is another service to size, secure and pay
  for.
- **MySQL on the existing Hobohost plan behind a PHP endpoint.** Rejected for
  now: real indexed queries at no new cost, but it adds a second runtime, a
  bulk load of ~370k rows per publish, token verification so it is not an open
  scraper, and unknown shared-host query and abuse limits.
- **One gzipped file per snapshot on a static host.** The smallest change and
  a ~5–10× smaller transfer, but every client still downloads the whole file,
  so cost still scales with users.
- **Do nothing but the `meta` check.** Cheap and worth doing regardless, but it
  does not change what a cache miss costs.

## Consequences

- Egress for a search drops from tens of MB to tens of KB, and R2 charges no
  egress. Storage (10 GB free) and read ops (10M/month free) are not a concern
  at this size.
- **Writes are the cost to watch.** R2 Class A operations are 1M/month free,
  then $4.50/M. Rewriting every type's object on every publish could be
  ≈8k types × 48 × 30 ≈ 11M a month (≈$45), which is why objects are
  content-addressed and only changed types are uploaded. The writer's ticket
  must measure how many types change per publish and, if needed, group small
  types into shared objects or publish less often.
- A new vendor, account, token and outage surface. A Cloudflare outage degrades
  the Contracts pages to the Firestore fallback while it exists, and to the
  existing "snapshot unavailable" states afterwards.
- A new `functions/` dependency (an S3 client) and the first use of Firebase
  secrets there. Deploys of `functions/` stay manual (see the project memory
  on Functions not being deployed by CI).
- The public data is no longer behind `request.auth != null`. It is public EVE
  contract data, so that gate was only ever friction; abuse is handled with
  Cloudflare WAF / rate rules on the custom domain if it appears.
- `connect-src` in any Content Security Policy and the service worker's
  runtime caching need `https://data.neocomdesk.com` added.
- The mixed-publish retry in `chunkedSnapshot.ts` and the chunk writer in
  `functions/src/index.ts` go away once the Firestore fallback is removed.
- Supersedes nothing in ADR 0013's _decision to use a backend-fed shared
  snapshot_; it replaces only where that snapshot is stored and how it is read.
