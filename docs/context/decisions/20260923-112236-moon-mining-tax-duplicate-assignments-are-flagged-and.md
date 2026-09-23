# Scope decisions — Moon Mining Tax: duplicate assignments are flagged and never summed

_Recorded 2026-09-23._

- **Two Assignments on one Mining Ledger Entry with the same Payee, tax % and
  ore lines, together claiming more ore than the entry holds, are flagged as a
  duplicate — never fused by summing.** A user's corp billed one obligation
  once while the ledger listed it twice (four paid twin pairs, ~20M ISK of tax
  counted twice). `coalesce.ts`'s fusion sums quantities and values, which is
  right for a day split to a second Payee and moved back (the halves add up to
  the entry) but doubles a true duplicate. With the fresh ledger in hand the
  planner now drops the extra and keeps the kept record's figures (preferring
  the joined-group member); with the entry absent from the read it leaves the
  pair alone rather than guess. Over-claiming alone is not flagged — a ledger
  that shrank under a lone record is legitimate (`ownership.ts`).
- **Paid duplicates are never auto-removed.** Only `outstanding`, unpaid records
  fuse at load. A paid duplicate gets a ledger banner and a row-detail notice;
  the pilot removes the extra with the existing Unassign action, which
  tombstones it for sync. No new "remove duplicate" button: Unassign already
  exists on every assigned row, and choosing which twin to keep is the
  pilot's call.
- **Creating an Assignment re-reads the database and refuses a claim the entry
  cannot cover.** `createAssignment` and `joinAssignments` (for members they
  would create) sum what stored Assignments — dismissals included — already
  claim on the character/date/system, and throw `AlreadyAssignedError` when
  that plus the new claim exceeds the entry's ore, inside the same Dexie
  transaction as the write so two tabs cannot both pass. Measuring quantity
  against the entry (not just "this ore type is taken") keeps assigning the
  unassigned residual of a type two Payees already share legal
  (`computeOwnership`'s no-collector case); callers that can't supply the
  entry's ore fall back to refusing any second claim on a type. The dialogs then
  refresh instead of saving a twin. This blocks the stale-view case; it cannot
  stop two devices that create records offline and later sync, which is what
  the banner is for. Left alone deliberately: a bucket that mixes a twin pair
  with a differently-shaped record still sums (the detector flags the twin),
  and identical halves whose entry has aged out of the 90-day ledger are no
  longer fused at load.
- **Root cause not proven.** No UI path creates a twin from a fresh, in-sync
  view. Leading candidates are a sync-pass/Undo race that loses a tombstone and
  resurrects the old record (`planSync.ts`'s end-of-pass `writeTombstones` uses
  a start-of-pass snapshot), or a stale second device. That race is left for a
  follow-up.
