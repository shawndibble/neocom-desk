# Scope decisions — Read EVE Workbench fits by id and deny listing workbenchFits

_Recorded 2026-10-03._

Supersedes the "client reads them all with one `shipTypeId` query" half of
`20261003-165853-keep-our-own-copy-of-eve-workbench-public.md`.

- **`workbenchFits` is `get`-only for clients; `list` is denied.** The
  collection needs no sign-in, so a public `list` let anyone page through all
  ~38k fits, EFT included, and the read bill is ours. A public `get` by id
  costs one read per doc someone already knows the name of.
- **The client reads a hull by id: `{shipTypeId}_0`, then the parts it
  claims.** Part 0 carries `parts`, the hull's part count; the client fetches
  `_1.._{parts-1}` in parallel. No `_0` means no fits for the hull, not an
  error. A claimed part that turns out missing (raced a delete) is skipped, and
  a count over 50 is read as 50 (a corrupt doc, not a real hull).
- **The sync writes part 0 after every other part, and deletes last.** So a
  reader never sees part 0 claiming a part that doesn't exist yet, after any
  committed batch, growing or shrinking; with nothing left, part 0 is deleted
  first. `planHullWrite` is the pure plan, tested batch by batch. The read is not a
  snapshot, though: a reader holding part 0's old count while a hull grows can
  miss the oldest fits, pushed into a part past that count, until its
  ten-minute cache lapses. Accepted — a transaction-free read can't avoid it,
  and it heals on the next read.
- **The sync still reads a hull by query.** It is admin, so the rules don't
  bind it, and the query finds parts a crashed run left past part 0's count,
  so they are re-merged and then deleted.
- **A part 0 without `parts` reads as one part.** That is every doc the
  earlier sync wrote. It lets the app ship before the function is redeployed
  without breaking: single-part hulls (most of them) read whole; a multi-part
  hull shows only its newest part until the sync next rewrites it, which only
  happens when a new fit for that hull arrives. No backfill — accepted.
