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
- **Creating an Assignment re-reads the database and refuses a second claim on
  an ore type.** `createAssignment` and `joinAssignments` (for members it would
  create) throw `AlreadyAssignedError` when any stored Assignment — a dismissal
  included — on that character/date/system already names one of the types;
  the dialogs then refresh instead of saving a twin. Ownership is
  presence-based per ore type, so a second claim is never a legitimate split
  (splits move units through `splitAssignment`). This blocks the stale-view
  case; it cannot stop two devices that create records offline and later sync,
  which is what the banner is for.
- **Root cause not proven.** No UI path creates a twin from a fresh, in-sync
  view. Leading candidates are a sync-pass/Undo race that loses a tombstone and
  resurrects the old record (`planSync.ts`'s end-of-pass `writeTombstones` uses
  a start-of-pass snapshot), or a stale second device. That race is left for a
  follow-up.
