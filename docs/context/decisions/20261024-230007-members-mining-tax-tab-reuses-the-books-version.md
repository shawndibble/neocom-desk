# Scope decisions — Members' Mining Tax tab reuses the book's version marker (issue #5050)

_Recorded 2026-10-24 · issue #5050._

- **A member's own lines are cached per Character and book under #5047's
  per-subcollection stamps**, in the same in-memory store as the officer view
  but under their own key: a member's copy holds only their lines. An unchanged
  book reloads — on every ledger reload, including Settle up's 10-minute
  recheck — for its `corpTaxBookBilledBy` pointer and its settings document.
- **No access probe is needed for member lines, unlike `meta/paid` for
  officers.** The rules let a member read a line by its own `uid`/`uids` field
  alone, so access changes only with a write, and every write moves the stamp.
  An officer's access, by contrast, expires on a clock.
- **`feederCoverage` is read only while the pointer, read fresh on every load,
  still names the book.** It is the one member part the rules gate on a
  document outside the book (`isBilledHere`), which no stamp tracks. The
  pointer is written for every observed Character, own-corporation members
  included, so this is exactly the rule; a read the pointer does not allow
  would be refused anyway. When the pointer cannot be read (offline, signed
  out), coverage is read live and uncached, as before.
- **The pointer itself is not cached**: it lives outside `corps/{id}` and is
  the access gate above.
- **No incremental `observed` pull**, for #5047's reason: edits rewrite past
  days, so a date window would miss them. A member's own rows are re-read when
  the `observed` stamp moves.
