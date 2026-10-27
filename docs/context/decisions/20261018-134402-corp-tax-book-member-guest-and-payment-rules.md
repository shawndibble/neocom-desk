# Scope decisions — Corp Tax Book member, guest and payment rules (issue #4055)

_Recorded 2026-10-18 · issue #4055._

D-numbers are the decision numbers in epic #4055.

- **Corp-side UI appears only when the corp has an active Corp Tax Book run
  by someone in the app (D24).** Otherwise the personal tab is unchanged apart
  from paid stays paid.
- **The personal tab and the book (D12).** An auto "<Corp> (Corp Tax Book)"
  Payee carries terms locked to the book, with dates. Before a day is
  Billable the corp member's own allocation applies, and the corp gets only a
  "Pending corp record" hint, never owed. Once Billable, the corp decides quantity,
  price and rate for exactly the quantity it observed; the rest stays where
  the corp member put it. Several books in one system on one day split the entry
  by observed quantity; ore no book claims is Unattributed, owed to no one.
- **Conflicts (D30).** If the corp member gave the day to another Payee, the
  corp's share comes from Unattributed first; otherwise it is a visible
  conflict, not owed, that resolves to the corp after 14 days with notice.
- **"Safe to pay"** reads "Safe to pay once <Corp> syncs (last synced 2d
  ago)" until a sync after the grace period, then "Safe to pay — 12 Jul is
  closed". A donation shows "Sent, waiting for the corp" until credited.
  Corp dismissals show in the personal tab with their reason.
- **Differences are shown (D28):** the diff and "Disputed: you 10%, book 15%"
  in row detail; the rate used and its effective date on every mail and
  verify page.
- **Own lines.** Anyone signed in with EVE SSO reads their own lines in any
  corp's book (ADR 0023).
- **Verify link (D27).** Every Statement mail carries a verify link to a
  read-only, no-login page (ADR 0023). Its "Stop reminders" toggle keeps the monthly Statement
  but allows officers only one manual reminder per Statement.
- **Leavers** keep their debt, flagged "Left corp, owes X", still mailed, with
  a one-click logged write-off. They keep read access to their own lines; the
  Payee is archived.
- **Guest close-account.** A final Statement, then mail stops. Credit is
  refunded by default; forfeited only with the guest's recorded consent or
  after 90 days with no reply.
- **Automatic credit (D5/D15).** Every `player_donation` into the selected
  division(s) (division 1 by default) from any character of a Miner credits
  at Miner level, oldest first. No code is needed; a code pins a donation to a
  Statement, and a coded donation from any character is credited without
  revealing any grouping. An unknown character with no code goes to
  Unmatched, claimable privately or assignable by an officer. Overpaying or
  prepaying becomes credit, printed on the next Statement.
- **"Not tax"** marks all or part of a donation as something else (a
  buyback); the debt reopens by that amount, logged. Manual payments are
  allowed and logged.
- **Declarations (D29).** "Paid by contract / other division / wrong corp"
  pauses Overdue for at most 14 days, then the clock resumes with a note. An
  officer confirms, or rejects with a reason, which gives a fresh 14 days. The
  app cannot move ISK between corps.
- **Dismissals (D6)** per record, Miner, moon or Extraction, each with who,
  when and a reason. Reversible, shown separately, never deleted. Optional
  Director approval above N ISK.
- **Miners (D18, D26/D26b).** Officers group characters into a Miner with a
  main for mail; the default is one per character. Characters on one app
  account in the same corp group automatically. Characters outside the corp
  are never revealed or linked unless the player adds them. Grouping a guest's
  characters by hand needs the guest's confirmation.
- **Rejected: monthly interest**, which the Alliance Auth plugin aa-miningtaxes
  charges on unpaid tax.
