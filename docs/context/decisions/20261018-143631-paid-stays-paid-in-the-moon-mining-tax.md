# Scope decisions — Paid stays paid in the Moon Mining Tax tab (issue #4060)

_Recorded 2026-10-18 · issue #4060._

Implements D23 of epic #4055 (ADR 0024). Supersedes, for paid Assignments
only, `20260905-180422`'s "a `needs-review` Assignment ... reverts to
`outstanding` even one that had been `paid`" as the outcome of late ore, and
`20261004-213852`'s "a late arrival on a paid entry already flips it to Needs
review". Dismissed growth still flags; unpaid growth is still absorbed.

- **A paid Assignment never grows; `computeOwnership` leaves its growth
  unassigned.** The rule lives in the ownership engine, not in `reconcile.ts`,
  because ownership is what both reconcile and the Tax tab's Unassigned
  residual read. Freezing the paid Assignment there makes reconcile find no
  diff (so status, `oreLines` and tax never move) and makes the late ore show
  as the ordinary Unassigned row for that day and system: the "new entry"
  needs no new record kind, no new status and no new UI. This also answers
  `20260905-180422`'s objection to a delta record ("how much of a shared ore
  line the paid Assignment actually paid for is unrecoverable"): the paid
  Assignment paid for exactly its snapshot, and the delta is entry minus
  snapshot.
- **Same rule for a split or a combined entry.** On a split whose growth
  collector is paid, the growth stays unassigned rather than passing to the
  other (unpaid) side, because the collector flag said whose ore it was and a
  silent hand-over would bill another Payee. In an unflagged legacy split, a
  type only a paid Assignment claims stays unassigned. A paid member of a
  combined entry is frozen like any paid Assignment; its day's late ore is its
  own Unassigned row.
- **The entry made from a paid day's late ore takes over collecting.**
  `createAssignment` and `joinAssignments` set `collectsGrowth` on a new
  Assignment when the entry's current collector is paid, and move it off a
  paid record that carried it. So a pilot still mining after paying gets one
  unpaid row that absorbs the rest of the day, as unpaid growth always has,
  rather than a fresh Unassigned row on every refresh. The flag moves rather
  than being added twice because `SplitDialog` and coalescing assume one
  collector per entry; only the paid record's `collectsGrowth` changes, never
  its status, ore or tax.
- **Out of scope: a legacy unflagged split.** When the paid side is only a
  type's sole claimant (no collector flag, a split made before the flag
  existed), nothing is handed over. Its late ore is assignable, but further
  growth on that type has two claimants and stays Unassigned, as legacy
  splits already do for shared types.
- **Already-flipped records are left as they are.** A paid Assignment that an
  earlier version already flipped to `needs-review` keeps its review and its
  Accept new total action; nothing migrates it.
