# Scope decisions — moon mining balances strip, settle-up flow, quantity split (issue #523)

_Recorded 2026-09-06 · issue #523._

Follows a UI/UX review of the shipped page on desktop (1440px) and mobile
(390px) against the user's real ledger, plus three mockups the user picked
from ("A" balances-first cards and "C" settle-up checkout chosen; "B" a
per-Payee statement page, not chosen; a fourth "D" split dialog added once
the user described the two-local-days-one-EVE-day case).

- **The page leads with a Balances strip: one card per Payee with an
  outstanding balance, and a "Settle up" button on each.** The user's own
  framing: "who do I need to pay and how much do I owe them, preferably in a
  way they can make a single lump sum payment." Cards carry only the Payee
  name, unpaid entry count, amount owed, and the button — the user cut the
  first draft's "oldest / last paid" figures as unneeded once Settle up shows
  the itemized list anyway, so four cards fit a wide screen. Payees with
  nothing owed are hidden behind a "Show settled" toggle (direct request).
  An "Unassigned" card sits beside them so a balance is never silently short
  of ore that hasn't been assigned yet. The three stat panels (total mined /
  total tax owed / unpaid entries) and the Payee-filter "Owed to X" panel
  from the previous round are removed — both answered a running-total
  question the strip now answers as a current balance, per Payee.
- **The Payee multi-select treats an empty selection as "all".** Found in
  review: with a single Payee, the only possible toggle produced "0
  payee(s)", an "Owed to 0 payees" panel and an empty table, with no way to
  reach that Payee's total. Clicking a balance card's name also sets the
  Payee filter to that one Payee, which is what "filter by payee" was for.
- **Bulk pay becomes a three-step Settle-up dialog** replacing
  `BulkPayConfirmDialog`: (1) the itemized entries with tick/untick and a
  running total — the decision doc's "never a blind mark-all-paid" rule
  stays; (2) the exact whole-ISK amount to send in game, copyable, with the
  Payee name and a suggested reason string, because the app cannot move ISK
  and the user pays in the EVE client between steps; (3) record it — paid-on
  date, method (donation / contract / other), and an optional link to a
  recent outgoing wallet-journal entry the app already caches (player
  donations, contract payments), amount-matching entries listed first.
  Steps 2 and 3 are skippable ("Just mark paid") for the quick case.
  Reached from a balance card (that Payee's every outstanding Assignment)
  and from the table's checkbox selection, as before.
- **A lump-sum payment is recorded on the Assignments it covers, not as a
  new table.** `MiningTaxAssignmentRecord.payment?: { paymentId, paidOn,
method, amount, journalRefId?, contractId? }` — additive, no Dexie
  version bump, nothing new for `merge`/purge, and only the two new optional
  fields (`payment`, `collectsGrowth`) added to `planSync`'s explicit field
  whitelist for the Assignment collection. Every
  Assignment in one settle-up shares a `paymentId`, so a per-Payee payment
  history is a group-by away when the "B" statement view is wanted later.
  Considered and rejected a `miningTaxPayments` table: a fourth synced
  collection (spec, tombstones, purge, character removal) for what is today
  one optional field, before anyone has asked to edit a payment on its own.
- **An Assignment can be split by quantity, and one Assignment per entry
  collects later growth.** Direct request: one EVE (UTC) day can hold two of
  the user's local-time sessions at two different corps' moons in the same
  system, and ESI reports them as one entry; today "a split assigns a whole
  ore line to a Payee, never a partial quantity of one" and a sole
  Assignment silently owns every later ore report for that day. New
  ownership rule (`engine/miningTax/ownership.ts`, TDD'd, replacing the
  presence-based residual in `rowStatus.ts`):
  - Per ore type, the residual is `entry quantity − Σ covering quantities`.
  - The entry's **growth collector** is the sole Assignment when there is
    exactly one, or the one flagged `collectsGrowth: true` when there are
    several. A collector owns every residual — it flips to Needs Review with
    the before/after diff exactly as today, and Accept re-snapshots it. No
    other Assignment ever grows.
  - With several Assignments and no flag (a split made before this change),
    the previous behaviour holds: a type claimed by exactly one Assignment
    grows into it; a type claimed by none is an Unassigned residual; a type
    claimed by two or more (only possible after this change) is Unassigned
    until someone is made the collector.
- **Split dialog: move part of an assigned day to a second Payee.** Per ore
  type, a slider or typed quantity moves units from the original to a new
  Assignment; a radio picks which side collects further ore for that day.
  Both sides are re-priced at the current Jita buy (`computeAssignmentValue`)
  rather than apportioning the original's possibly hand-edited value — two
  independently priced obligations is the same rule "join entries" already
  chose. The original keeps its status (a Paid day can be split after the
  fact; the paid figure stays with the kept side), the new one starts
  Outstanding. Offered for Outstanding and Paid rows that aren't part of a
  joined group; Needs Review must be accepted first so the split works from
  the current total.
- **Review fixes folded in, all found against the live page.** The first
  Escape press never closed a modal because `showModal()` focused the
  header's close `IconButton`, whose Radix tooltip both showed a stray
  "Close" bubble and consumed the Escape — initial focus now lands on the
  dialog body. Body scroll is locked while a dialog is open (the page
  scrolled behind sheets on mobile). Outstanding/Paid/Needs Review rows gain
  an "Unassign" action (the Assign form's own comment promised "Undo + a
  fresh Assign" for resplitting, but Undo existed only for Dismissed). The
  edit form's primary button reads "Save" for an existing Assignment. Payee
  Manager's two inputs stack full-width (the tax % placeholder was
  truncated to "Default ta:"). The Date column and detail titles carry an
  info tooltip: the date is the EVE (UTC) calendar day from the in-game
  ledger, and ESI gives no time of day, so no local-date conversion is
  possible (direct request).
