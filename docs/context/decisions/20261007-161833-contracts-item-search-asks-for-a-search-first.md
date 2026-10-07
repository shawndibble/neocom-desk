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
