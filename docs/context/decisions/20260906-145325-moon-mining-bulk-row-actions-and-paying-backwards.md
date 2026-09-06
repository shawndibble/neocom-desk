# Scope decisions — moon mining bulk row actions and paying-backwards payment links (issues #539, #540)

_Recorded 2026-09-06 · issues #539, #540._

## Bulk row actions (#539)

- **The checkbox column gets a toolbar of its own, above the table, rather than
  more buttons in the filter row.** The v1 layout put "Settle up selected" and
  "Join selected" among the Character/Payee/Status dropdowns, where they read as
  two more filters. A bar that appears only once something is checked — count,
  select-all/clear, then the actions — is what makes the checkboxes legible as a
  selection at all. An action that cannot apply to the current selection renders
  **disabled with a one-line reason** instead of disappearing: a Combine button
  that vanishes teaches nothing about why these three rows can't be combined.

- **Select-all lives in the toolbar, not in the table header.**
  `DataTableColumn.header` is typed `string`, and widening the shared `DataTable`
  API to take a `ReactNode` header for one table's benefit is a worse trade than
  a button two inches away. Rules out a header checkbox until some second table
  needs one.

- **Bulk dismiss covers `unassigned` rows only.** `dismissEntry` is defined over
  `row.unassignedOreLines` — an assigned row has no unassigned residual, so
  "dismiss" there would have to mean _delete the Assignment and replace it with a
  dismissal_, which is what the row detail's Undo already does deliberately and
  one row at a time. Checked rows that aren't unassigned are simply not counted
  by the Dismiss button.

- **Bulk dismiss still shows an itemized confirm.** Same rule the settle-up flow
  established: never a blind mark-all. Dismissal is the one action with no Payee
  and no ISK to sanity-check afterwards, so the list of what is about to go away
  (with its total estimated value) is the only place the pilot can catch a
  mis-click.

- **Joins are N-way; the two-member cap was always UI-only.**
  `joinAssignments` is already N-ary and `flatten` already renders groups of 2+.
  A mining session split across three EVE/UTC days is the ordinary case the cap
  made tedious.

- **A selection may contain at most one distinct `groupId`.**
  `joinAssignments` adopts the first `groupId` it finds among its members, so a
  selection spanning two existing groups would re-tag one group's _selected_
  member while its non-selected siblings kept the old id — two half-groups, no
  error. One group plus ungrouped rows is valid and means "add these to that
  group"; when a grouped row is in the selection only its primary is passed,
  since the siblings already carry the id. Rules out merging two groups without
  first ungrouping one.

- **The toolbar counts over visible rows, not every row.** Selection state
  survives a filter change, so counting over `allDisplayRows` (what v1's
  `bulkPayRows` did) lets a bulk action reach rows the pilot can't see. Tolerable
  for settle-up, not for dismiss.

## Paying backwards (#540)

- **Payment linking runs in both directions, and the reverse one starts from the
  payment.** Settle-up answers "what shall I pay?"; this answers "I already paid
  — what did that cover?". They share `markAssignmentsPaid` and the same
  itemized tick/untick list, and deliberately do not share an entry point: the
  reverse flow is offered from the Balances strip, next to the Unassigned card,
  because it is a _balance_ observation ("this ISK left your wallet and isn't
  accounted for"), not a table filter.

- **Contracts contribute only payment in kind.** ESI's `PAYMENT_REF_TYPES`
  already carries `contract_price` / `contract_price_payment_corp` /
  `contract_deposit`, so _accepting the landlord's ISK contract_ arrives through
  the wallet-journal path for free. The one case the journal cannot see is an
  `item_exchange` contract the pilot **issued** at `price === 0` — ore handed
  over instead of ISK. Those are matched on `assignee_id` and date, and their
  **cargo is deliberately never priced**: `getCharacterContractItems` is not
  called, and the amount is prefilled from the selected Assignments' own total
  for the pilot to confirm. Rules out a second valuation model living beside the
  Jita-snapshot one that Assignments already defend.

- **The date window is asymmetric.** A pilot pays _after_ mining, and one payment
  covers a span of entry dates — so the test is `entryDate <= paymentDate + 1d`
  (a day's grace for the EVE/UTC edge) **and** `paymentDate - entryDate <=
WINDOW`, not a symmetric ±N around either date. A payment that predates the
  mining it supposedly settles is not a match.

- **A Payee learns its EVE `entityId` from a confirmed link.** Recipient identity
  is a far stronger signal than amount or date, but a Payee is a free-text label
  ("pick the moon, the corp, or the person, whichever is memorable") with no id
  to match against. Rather than ask for one up front — a field almost nobody
  would fill in — the first confirmed link records `second_party_id` /
  `assignee_id` on the Payee, and every later payment to that recipient matches
  on identity.

- **Name equality is a separate, lower-ranked, self-declaring tier — never
  folded into identity.** _(Amended during implementation; the original wording
  ruled name-equality out altogether, which left no way to reach the first
  confirmation.)_ A learned `entityId` only exists after some link has been
  confirmed, so an identity-only rule can never bootstrap: a pilot who sends a
  round 50M against a 47.3M balance would match on neither identity nor amount
  and would never be offered the payment that would have taught the id. So a
  Payee-name match is kept, but as its own `name` / `name-and-amount` confidence
  ranked strictly below the `identity-*` tiers, and worded so it never claims to
  know the recipient ("Name looks like X — check this is right"). A learned id
  always wins over a namesake. What stays ruled out is name equality presented
  _as_ identity, which is what the confidence label had wrong.

- **No ignore-list for payments.** `payment` is optional and settle-up's later
  steps are skippable, so "already linked" has a real false-negative edge: a
  donation settled through "Just mark paid" carries no reference and stays
  eligible forever. The fix is to **only offer a payment that has a plausible
  target** (recipient identity or amount, inside the date window) and to keep the
  entry point a quiet card rather than an alert — not a new synced table of
  payments the pilot has waved away.

- **Wallet and contracts stay out of `ROUTE_REQUIREMENTS['/moon-mining']`.** That
  table drives `ScopeGate`, so listing a scoped endpoint gates the entire page on
  a grant that is a secondary enhancement here — the same call `/assets` makes
  for `getCharacterLocation` and `/clones` for `getCharacterSkills`. Without the
  data the strip simply shows no card.
