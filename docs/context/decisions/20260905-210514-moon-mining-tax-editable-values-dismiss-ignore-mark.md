# Scope decisions — Moon Mining Tax: editable values, dismiss, ignore, mark-paid default (issue #523)

_Recorded 2026-09-05 · issue #523._

- **"I already sent this in-game" is renamed "I already paid this" and now
  defaults OFF, reversing the original decision doc's "defaults on;
  unchecking it is the only way to leave something Outstanding."** Direct
  user feedback after using the shipped v1: the checkbox reads more safely
  the other way around — a renter actively mining and assigning as they go
  is more often _not_ paid yet at the moment they assign, and an unchecked
  default means the only way to mark something paid is a deliberate,
  affirmative click rather than remembering to uncheck an assumption made on
  their behalf. The itemized bulk-pay confirmation (never a single blind
  "mark all paid") is unaffected — it still requires the same reviewed,
  affirmative action either way.
- **Estimated value and tax owed are now pilot-editable fields in the Assign
  dialog, prefilled from `computeAssignmentValue`'s Jita-priced default but
  independently overridable.** `createAssignment` (assignments.ts) no longer
  fetches Jita prices or recomputes these itself — it persists exactly what
  the dialog supplies, since the whole point of an editable field is that
  what the pilot leaves in it, not a silent recomputation, is what gets
  invoiced. `resolveNeedsReview`'s own re-snapshot (accepting ore growth) is
  unaffected and keeps auto-computing from a fresh price, since that path has
  no dialog step to correct it in yet.
- **A new `dismissed` status ("I don't pay tax on this entry") joins
  outstanding/paid/needs-review, with no Payee at all.**
  `MiningTaxAssignmentRecord.payeeId` becomes optional — absent only for
  `dismissed` rows — rather than inventing a placeholder Payee or a
  parallel "ignored entries" table. A dismissed entry still snapshots
  `oreLines` and still re-diffs against fresh ledger reads exactly like a
  real Assignment (`reconcile.ts` doesn't special-case status at all), so
  growth on a dismissed entry surfaces for reconsideration instead of
  silently staying tax-free forever. Dismissing is a one-click action on the
  whole unassigned residual (no split-line picker, unlike Assign) since "I
  don't owe tax here" is a coarser, lower-stakes judgment than picking a
  Payee and rate; it's undone via the existing generic `deleteAssignment`
  (already implemented for real Assignments, just newly wired into the UI as
  "Undo"). Dismissed rows are opt-in to view by default, alongside Paid.
- **The "unclassified ore" banner's manual tag action is now two actions, not
  one: "Tag as moon ore" and "Ignore."** The decision doc's original text
  ("tag it below if it's moon ore") only covered the allowlist-gap case. In
  practice an unrecognized `type_id` is just as likely to be an ordinary
  ore/ice type the broader `oreAndIceTypeIds.json` allowlist hasn't caught up
  to as it is to be a genuine new moon-ore variant, and there was no way to
  say "this isn't moon ore, stop flagging it" without also mis-tagging it as
  moon ore. `typeOverrides.ts` now tracks two independent device-local lists
  (`manualMoonOreTypeIds`, `manualIgnoredTypeIds`); "Ignore" joins only the
  broader ore/ice set (stops the flag) while "Tag as moon ore" joins both
  (stops the flag _and_ groups it into future entries).
- **Assign and Dismiss render as `IconButton`s (`Icon.AddToPlan`, `Icon.Close`)
  in the row, not text `Button`s.** Matches the row-action density of the
  rest of the table (a Select checkbox, Payee, Value, Tax columns already
  compete for width) and reuses `Icon.Close` for "dismiss/remove" — the same
  glyph `PlanList.tsx` and others already use for that meaning, rather than
  introducing a second visual vocabulary for it.
