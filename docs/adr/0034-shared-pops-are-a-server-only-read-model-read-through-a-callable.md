# 0034 — Shared Pops are a server-only read model, read through a callable

## Status

Accepted (2026-11-15). Issue #6223. Scope: `docs/context/decisions/20261115-122511-corp-tax-book-shares-moon-pop-schedules.md`. Settings: #6222 (`functions/src/popSharing.ts`). Builds on ADR 0032 (small server-built read models).

## Context

A Corp Tax Book's officers can share the pop schedule of the moons the book handles with pilots outside the book: the book's corporation, its alliance, or Communities. Those pilots are not officers, so they can read nothing under `corps/{id}`. Who may read a pop depends on things Firestore rules cannot check:

- **Corp and Alliance membership is live**: a pilot who leaves the corporation or alliance loses the pop at once. Rules have no ESI.
- **"Any of the pilot's Characters"**: each Character has its own Firebase session (`char:{id}`), and a rule sees only one.
- **A Community share holds only while an officer of the book is a Member there**: an officer who used the book with an editing role in the last 30 days, with no failed role check since, still in the book's corporation. The officer record (`corps/{id}/officers`) expires within a day, so it cannot be the test.
- **A Community admin can block a sharing corporation.**

## Decision

### Storage

- **`sharedPops/{corporationId}`**: one doc per sharing book, top level and server-only (rules deny every client). It holds the book's corporation and alliance, `corpShared` / `allianceShared` / `communityIds` (for the queries below), the Community names the officers chose, `syncedAt` (data age) and `pops[]`. A pop holds its id (`{corporationId}_{extractionId}`, the deep-link id), moon, refinery id, name and system, Pop Time and its instant (`popAt`), whether the chunk was fractured, start and expiry, ore make-up in units when shared (never ISK), notes, start-link rate and the `audienceKey`s it is shared with. One doc per book is one read whatever its size; a book's live pops are a few dozen at most.
- **`sharedPopSources/{corporationId}`**: server-only inputs for publishing: `editors` (per officer: `characterId`, `ownerHash`, `usedAt`, `failedAt`) and `refineries` (the book's own refinery names, looked up with the Automatic sync grant, which carries the structures scope).
- **`communities/{id}/popSharingBlocks/{corporationId}`**: an admin's block (`by`, `at`), server-only. Deleted with the Community (`recursiveDelete`).

### Publishing

`publishSharedPops` (`functions/src/sharedPopsStore.ts`, pure half `functions/src/sharedPops.ts`) rebuilds the doc, or deletes it when the book publishes nothing, after:

- every sync (`syncBookAs`, so officer and Automatic syncs) and every moon owner Extractions write (`storeFeederExtractions`);
- `setPopSharing`, `setPopSharingMoon`, `updateSettings`, `addRate`, `linkSurvey` edits;
- a moon owner's opt-out or opt-in.

So turning sharing off, removing an audience or an opt-out takes a pop away at once. A pop lives from its Extraction's start until Expired (fracture plus the refinery's expiry, 48 h by default, at most 96 h); Ready shows the chunk's arrival and Auto-fracture its natural decay, and a fired laser moves both to the actual fracture. The book's alliance is re-read from public ESI at most every 6 hours. If sync stops, the doc stays as last published (a started Extraction's times do not change); reads still drop expired pops.

### Reading

A pilot reads through the `listSharedPopsCallable` action (`corpTaxBookCall` router). The signed-in Character counts; the client sends its other Characters' access tokens, which are verified, used and dropped (as `registerDevice` does). The server:

1. reads every Character's corporation and alliance from public ESI `POST /characters/affiliation/` (cached 5 minutes per instance);
2. reads their Communities from `characters/{uid}/communities` and checks each Member doc's `ownerHash`;
3. fetches `sharedPops` by corporation id (doc ids), `allianceId in`, and `communityIds array-contains-any`;
4. counts a Community for a book only if it has no block for that corporation and a qualifying officer of the book is a current Member;
5. returns the pops whose audiences match and which are not Expired, without the audience list.

Corp and Alliance are always the book's own corporation and its alliance (stored on the doc), never a moon owner's. The editor stamp is written by `authorizeOfficer` on any authorized call by a Character with an editing role; a failed live role check, a refused edit, or a lost role on the Automatic sync grant writes `failedAt`.

The Sharing tab asks `getCorpTaxBookPopSharingCommunitiesCallable` for each chosen Community's state and marks one with no officer "No officer in this Community". A Community admin lists and blocks sharing corporations with `listCommunityPopSharersCallable` and `setCommunityPopSharingBlockCallable` (`communityCall` router).

## Consequences

- No new deployed function: four router actions. No composite index: each query is a single-field filter.
- Every read costs the viewer's index and Member docs plus one ESI affiliation call; the Calendar and notifications should cache the result for minutes, not call per render.
- The client seam is `src/sync/sharedPops.ts` (`fetchSharedPops`, `findSharedPop`); a server sweep (Scheduled Push) can call `sharedPopsFor` with a device's Characters.
- A moon owner's ore make-up is unknown unless an Extraction carries `oreLines`; a moon owner's grant cannot read the notification that has it.
- Additive: new collections only; `meta/popSharing` and the feeder record are read, not changed.

## Considered options (rejected)

- **Per-audience copies under `corps/{id}` with rules on corporation or alliance claims.** Custom claims would need refreshing whenever a pilot changes corporation, and rules still could not check "any of my Characters" or the Community officer rule.
- **One doc per pop.** More reads per viewer and more writes per publish, for no query the per-book doc cannot answer.
- **Checking the officer rule at publish time.** A leave or a removal must take effect at once, not at the next sync.
