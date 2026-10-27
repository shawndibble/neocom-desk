# Scope decisions — The Corp Tax Book carries a version marker per subcollection (issue #5047)

_Recorded 2026-10-24 · issue #5047._

- **Every server write under `corps/{id}` restamps `corps/{id}`: a fresh
  `bookVersion` and a fresh `collectionVersions.<subcollection>` for each
  subcollection written.** A stamp per subcollection, not one for the whole
  book, is what lets an edit re-read only what it touched — any officer's
  edit, without a per-action map of what each callable writes. Stamps are
  random ids compared for equality, never counters: a deleted and re-created
  book must not reuse a stamp a client still holds.
- **The stamp is applied by a hook on `WriteBatch`, scoped per callable request
  and scheduled job, not by a bump at each write site.** About two hundred
  writes in a dozen files reach a book; one forgotten bump would serve officers
  a stale book with nothing to show for it. Every Admin SDK write route builds
  through `WriteBatch`, and a test pins each route so an SDK change fails
  loudly. `BulkWriter` and `recursiveDelete` are also recorded where they are
  called, since both can build the write later, outside the caller's context.
  This rules out hand-placed bumps.
- **A book is stamped two seconds after its writes, not at the end of the job.**
  The scheduled sync runs every book in one scope for up to nine minutes; held
  to the end, a book's stamp would lag its writes by that much, and a job
  killed by its timeout would never stamp at all. A final stamp still covers
  whatever the last two seconds wrote.
- **All the wrapped functions deploy together.** An unwrapped, older function
  writing a stamped book moves no stamp, and officers see its writes only once
  their copy ages out (an hour).
- **Officer access records, the audit log and the SRP collections move no
  stamp.** The officer page re-checks access on every open, which rewrites the
  officer record; stamping it would invalidate every cache on every open.
- **The client trusts nothing without a stamp, and nothing older than an
  hour.** Functions are deployed by hand, so a client can run before any stamp
  exists; it then reads the book in full, as before. The hour bounds a stamp
  the server failed to write (logged, never failing the edit).
- **The copy is in memory, per tab, not in Dexie.** It saves the reads that
  dominate (every mount, every reload after an edit, the repeated reads in one
  sync) without persisting officer-only data on the device or needing cleanup
  on Character removal. A cold start reads the book once.
- **`meta/paid` is read on every open, never from the copy.** It is
  officer-only, so the rules still decide every read; an unchanged book costs
  two reads rather than one.
- **`observed` is not read by date window.** Edits rewrite past days
  (`markNotTax`, rebills, refinery labels), so a `date >=` window would miss
  them. It is re-read whenever its stamp moves — in practice once per sync.
