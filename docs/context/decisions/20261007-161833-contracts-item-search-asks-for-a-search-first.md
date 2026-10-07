# Scope decisions — Contracts item search asks for a search first and reports the download (issue #2921)

_Recorded 2026-10-07 · issue #2921._

- **The Items board shows a prompt, not the table, until something is being
  searched for — and the snapshot downloads behind it regardless.** ~370k
  offers rendered for no query answered no question, and the wait for them was
  the first thing every visitor met. The download still starts on open, so by
  the time someone has typed a name the rows have usually landed; a search made
  before then waits behind the existing spinner with the filter bar still
  usable. Rules out gating the download itself on a first search, which would
  only move the wait to the moment someone is waiting on an answer.
- **Any control off its default is a search.** An item name, a pinned item, a
  region, a price ceiling, a minimum quantity, a sale kind, either "hide"
  toggle or a jump range all lift the prompt (`itemsSearchActive.ts`), so
  "everything within 10 jumps" needs no item name. A whitespace-only query does
  not. "Reset filters" returns to the prompt rather than to every offer.
- **The snapshot is read as `meta` + chunk docs by id, a few at a time, not as
  one collection query.** This supersedes #963's "progress is a stage, not a
  percentage": that held because a single `getDocs` has no denominator, but
  `meta.chunkCount` supplies one. The read count is unchanged (~125); the bar
  reports chunks landed of that count. Progress lives in a small store keyed by
  cache key, because the loader runs inside `loadWithCache`, which settles once
  at the end. A snapshot whose `meta` carries no `chunkCount` (published before
  it was recorded) falls back to the old one-query read, with an indeterminate
  bar.
- **`meta` is re-read after the chunks and the read retried once if it moved.**
  The writer replaces chunks one by one and `meta` last, so a publish landing
  mid-read would otherwise hand back chunks from two cycles. The collection
  query was close to atomic; per-doc reads are not.
- **Not done here:** the Courier board is unchanged (one chunk doc, nothing to
  prompt for), and BPC Sourcing keeps its whole-collection read.
- **The snapshot is sorted by item type, and an index doc records where each
  type lives.** Chunks used to be sliced in contract order, scattering one
  item's offers across every chunk. Sorted by type, an item occupies a run of
  one to a few chunk docs, and `publicContractOffersIndex/types` holds
  `[count, cheapest, firstChunk, lastChunk]` per type plus every region with an
  offer. With it the board suggests names (with counts) and fills the region
  list before any chunk lands, and a search naming a few types reads only
  their chunks. Per-row docs were ruled out: 370k rows x 48 runs/day is ~17M
  writes against a 20k/day free tier, and per-type docs (thousands) blow the
  same budget. The index adds one write per run.
- **The index is its own collection, not a doc in the chunk collection.** An
  older client (a stale PWA bundle) and BPC Sourcing read the whole offers
  collection and treat every non-`meta` doc as a chunk of rows; a stray index
  doc there would crash them. The index write also never fails a sync run: it
  is an optimisation, logged on failure, and a client with no index waits for
  the full snapshot as before.
- **An early read is trusted only while the index still describes what is
  published.** The index and `meta` both carry `lastSyncedAt`; the reader
  checks `meta` before and after fetching the chunks and returns nothing if it
  moved, so a publish landing mid-search cannot hand back rows from the wrong
  layout. A search whose types span more than 12 chunks, or that names no type
  (price, region or jump range alone), waits for the full download, which is
  already running. Chunk docs are memoised per publish cycle.
- **The early rows are a stand-in, not a second source of truth.** Names,
  region options, locations and the table read `rows`, which is the early rows
  until the full snapshot lands and the full rows after, so nothing downstream
  knows which it has. Index counts and cheapest ignore the other filters until
  the full rows arrive.
- **Deploy order matters.** The Cloud Function and `firestore.rules` are not
  auto-deployed. Until both ship, the app finds no index and behaves as the
  search-first page without early reads; until the function has run once,
  chunks are still contract-sorted but nothing reads their order.
