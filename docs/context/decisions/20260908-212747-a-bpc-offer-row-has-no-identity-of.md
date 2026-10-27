# Scope decisions — A BPC offer row has no identity of its own so the table keys on position

_Recorded 2026-09-08._

- **`DataTable`'s `rowKey` receives the row index, and BPC Search uses it.**
  A public contract lists the same blueprint once per copy, so the row a
  buyer sees has no identifying field of its own. Measured against a live EVE
  Ref pull of 122,071 rows:

  | key                                | rows sharing a key | worst repeat |
  | ---------------------------------- | ------------------ | ------------ |
  | `contractId`                       | 84.3%              | 1,000x       |
  | `contractId:typeId` (what shipped) | 70.4%              | 528x         |

  React reconciles on the key, and under duplicates it left rows from the
  previous render stranded in the table: picking a blueprint showed its
  offers _beside_ unrelated ones, while the summary above — computed from
  data rather than the DOM — read correctly. That split is what made it look
  like a filter bug when the filter was never wrong.

- **Narrowing the key was not an option, so position is the honest answer.**
  Repeated lines are identical in every field the snapshot carries; the only
  thing separating them is `record_id`, which the sync drops when it compacts
  a row. Adding it back would put ~1MB on a payload every client downloads,
  to distinguish rows a buyer cannot tell apart anyway. Position is stable
  for a list that is fully re-derived and re-sorted on every change.

- **`rowKey`'s contract now says unique, and says why.** It was a plain
  `(row) => string | number` and nothing suggested collisions mattered.
  Callers with real ids ignore the new second argument.

- **Every fixture gave each row its own `contractId`, which is why no test
  caught it.** The regression test now builds one contract listing one
  blueprint four times — the shape that actually occurs — and asserts the
  previous blueprint's rows are gone after narrowing.
