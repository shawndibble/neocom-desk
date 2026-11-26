# Scope decisions — A closed unpaid day's records are rewritten to match the book (issue #6766)

_Recorded 2026-11-25 · issue #6766._

- **Once every Corp Tax Book on an entry has closed the day, the miner's stored Assignments are
  rewritten to the books' figures, when nothing was paid.** Per the user: the miner is trusted
  until the book closes the day; then the records are brought into line rather than shown as a
  difference. This supersedes two parts of decision 20261125-201722: "the excess is neither billed nor
  shown" (on an unpaid day the excess is now really unassigned in the stored records), and, for
  unpaid closed days, its out-of-scope line on ore the miner gave another Payee that the book
  recorded: that ore now moves to the corp's Assignment at once instead of waiting 14 days as an
  `otherPayee` Conflict. Paid days keep the old Conflicts until #6767.
- **One pure planner, one apply.** `planClosedDayFix(day, paidInto)` in
  `src/engine/corpTaxBook/closedDayFix.ts` returns the whole set of Assignment changes for one
  entry (character, day, system) and a state: `aligned`, `fix` or `conflict`. The overlay hands it
  its input (`PersonalOverlay.closedDays`). `fixClosedDay(plan, reason)` in
  `src/features/miningTax/ledgerActions.ts` writes the changes and one Record Change in one
  transaction. The automatic path (`useClosedDayFixes`, reason `autoFix`) calls it for `fix`
  plans only; Fix my records (#6767) calls the same apply for a `conflict` plan with reason
  `fixMyRecords`.
- **What the planner does, per book on the entry (each matched to its own share from
  `splitAcrossBooks`):** the book's own-Payee Assignments shrink to its share, last Assignment
  first, and the rest goes back to free ore. Then, if they hold too little, ore comes from the free
  ore first and then from the miner's other splits that day (other Payees, Default-made ones
  included, unpaid ones before paid ones, through `previewTakeover`), into the first own-Payee Assignment. With none, one is created for the corp's first
  own Payee; with no Payee for the corp at all nothing is created and the overlay keeps billing as
  before. An own-Payee Assignment takes the book's rate and is priced at the book's prices for the
  day (its hub and Ore Form, the same prices the book row shows); other Assignments keep their own
  rate and are re-priced at their Payee's hub, as "Let the corporation bill it" does
  (`releaseOreFromAssignment`).
- **Released types stop ESI's ledger growing the ore back.** Every changed Assignment records the
  types it lost in `releasedTypeIds`; an own-Payee Assignment also records the book's types, so
  growth after close no longer goes to the Growth Collector as a needs-review: it is free ore,
  which the book takes when it records it and the next fix moves into the corp's Assignment. A
  needs-review own-Payee Assignment is set back to outstanding by the fix.
- **Freed ore shows as unassigned.** Released ore no book takes is now offered on the Tax tab
  (`buildDisplayRows` adds `releasedOreLines` to the free ore before taking the books' ore off),
  so the miner can give it to another Payee. Before this the release was only ever ore a book
  took, so it stayed hidden (decision 20261122-075844); the snapshot's own `unassignedOreLines`
  is unchanged, so Default Systems still never see it.
- **"Nothing paid" is three checks, any of which makes the day a Conflict instead.** A changed
  Assignment is `paid`, or its Payee's running account applied money to that day (`paidInto`, from
  `PayeeRunningAccounts`); the book's Running account applied money to the day (payments, credit
  carried in, a checkpoint or stored Paid through covering it; corrections and write-offs are not
  money); or a donation the book has not credited yet could be for it (an uncredited donation that
  covers the day, or any made after the day while it is unsettled). A paid Assignment the fix
  does not change does not block it.
- **Days left alone:** a day any book still has open or pending on the entry (another corp in the
  same system that has not closed yet), a day the corp dismissed, a day held by a dispute, a day
  the book bills at two rates (one Assignment cannot carry both), an entry the miner never split
  (all free ore: the book bills it from free ore as before), and closed days where the book
  observed nothing for the entry. Every closed unpaid day qualifies, not only newly closed ones, so
  the first run after this ships brings older days into line too.
- **Idempotent.** A fixed day plans `aligned`, so nothing more is written. The Record Change id is
  `{reason}:{character}:{day}:{system}:{outcome}`, so the same fix never saves twice, and a later
  real change (a late refinery log) is a new id. The apply re-reads the stored Assignments and
  checks, inside the write transaction, that they still match the plan's "before", and writes
  nothing if not (a stale plan, retried on the next run). A created corp Assignment's id comes from
  the entry and Payee, so two devices create the same record. A Default-made split stays
  Default-made after ore is taken from it. "Money reached the day" is one rule,
  `MinerRunningAccount.moneyAppliedOn`, for both the book's and a Payee's account. The automatic
  path waits for the first pull of Record Changes, payment links and Assignments.
- **The display-only own-Payee trimming stays for now, for paid days.** With the stored records
  matching, `overlayCorpBooks`' own-Payee excess is empty on every fixed day, so its `trimmed`
  entry is never made there. On a paid day the excess is still hidden as before until #6767's
  Conflict and Fix my records replace it; `absorbed` stays, since the book's rows still stand in
  for the matching Assignment.
- **The word Conflict.** A `conflict` plan is a closed day the fix may not touch because money
  reached it; #6767 shows it as the Conflict the user asked for and defines it in the glossary.
- **Known limits.** If an own-Payee Assignment is emptied and deleted, its released types go with
  it; ESI growth of those types can then reach the remaining Growth Collector. An own-Payee Assignment priced in the
  book's Ore Form is re-priced to the pilot's own setting by `repriceForOreForm` when the two
  differ (the ore and rate stay).
