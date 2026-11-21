# Scope decisions — A Miner's account and late notices replace Statements

_Recorded 2026-11-20._

Builds on decisions 20261117-033049, 20261117-043246 and 20261117-060555 (every Corp Tax Book is a
running account).

- **"Statement" leaves the system.** Every book is a running account and production holds no
  calendar Statement: every `corps/{id}/statements` doc is a late notice (`kind: 'notice'`). The
  calendar Statement engine (cadence, periods, the minimum and its roll-over, the 100k tolerance
  floor, payments settling one Statement, frozen Statement lines) is dead code, and it goes. No
  data is converted, because there is none to convert.
- **Two objects replace it, each doing one job, named by the glossary.** The **Running account**
  (`MinerRunningAccount`, `src/engine/corpTaxBook/minerRunningAccount.ts`) bills every closed day
  and pays the oldest unpaid day first; it is the one thing a screen, a notice, a total or the
  verifier reads for what a Miner owes. A **Late notice** (`LateNotice`,
  `functions/src/corpTaxBookLateNotice.ts`) is only a record of what was asked: its lines as they
  were priced, who issued it, who may read it, its mail state. It takes no money, has no amount to
  settle, and is settled once every day it listed is (`lateNoticeStanding`). Rules out renaming
  Statement in place, which would keep a bill's fields (period, coverage, a total to settle, a code
  that pins money) on a thing that is not a bill. "Account" alone is the glossary's grouping of
  Characters, so the code never says it bare.
- **Behaviour lives on the Running account; what is stored stays plain data.**
  `MinerRunningAccount` is a class built from plain inputs (`MinerRunningAccount.build`) with the
  questions every reader asks (`day`, `owedDates`, `standingOf`). It is never stored or sent: the
  book stores its inputs, and what it records of an account is plain JSON. A Late notice is a
  stored doc shared with the Cloud Functions (decision 20261117-230113), so it stays a plain type
  with pure functions.
- **Every officer write-off forgives the oldest unpaid days.** A late notice is no bill to pin
  one to, so a write-off that names a notice no longer forgives nothing (the legacy pass dropped
  it).
- **One payment code per Miner** (`minerPaymentCode`, on the shared `paymentCode` hash), since money pays the oldest day whatever
  code it carries. Codes on notices already mailed stay recognised.
- **Rollout, additive first** (dev and production share one Firebase project): (1) the Running
  account and Late notice engine beside the old code, `allocateRunningAccount` on the same day-settling core
  and a property test that the two agree on books with no Statements; (2) a `lateNotices` collection
  with its rules, server actions and a backfill from `statements`, mirrored back to `statements`
  for older tabs; (3) the client reads `lateNotices` and every UI string, route and i18n key says
  late notice, with old verify links and codes still working; (4) the calendar Statement code and
  the Statement-built totals (`minerTotals`, the Miners list, the overview) are removed or rebuilt
  on the account, and a Miner's page reads from their paid-through day; (5) after a soak, the
  `statements` mirror, its rules and the legacy server fields and actions go; (6) the glossary,
  ADRs and decisions are rewritten without Statements.

## Added 2026-11-20: one way to pay, a ledger, and a closed-through date

- **Every Payee is paid oldest first, the way a Corp Tax Book is.** The personal Moon Mining Tax
  ledger stops keeping paid marks per Assignment: a payment to a Payee pays that Payee's oldest
  unpaid day, whether the Payee is a corporation with a book on Neocom or not, and the pilot's
  figures for a book's Payee are read off the book's Running account, so the two cannot disagree.
  A pilot still shapes what is owed per Mining Ledger Entry: dismiss it (won't pay), change its
  tax %, or split it between Payees. Working out whose ore is whose (several books in a system,
  Conflicts, Unattributed) is unchanged: it decides what is owed, not what is paid. Rules out the
  "Marked paid" reconciliation, part-paid ore shares and the parity test between the Tax tab and
  the book.
- **A Payee ledger.** Clicking a Payee opens a `SlideOver`: every charge (a mined day, a
  correction), payment, write-off and late notice in date order with a running balance, its
  "Paid through" and "Owes" status, filters and the table export. One component, fed by the
  Running account of either kind of Payee.
- **A closed-through date keeps the work bounded.** ESI's ledgers reach back about 30 days, so
  older days cannot change by sync. Each Running account keeps a stored checkpoint, rolled
  forward monthly to the end of the last month that is at least 31 days old: through that date,
  what was still owed per day (usually nothing), the credit, and the balance. A load reads the
  checkpoint and only the days after it. A fix to a closed day is an Adjustment dated today, as an
  opening balance is. A corp book's checkpoint is written by an officer's tab through a callable,
  as the paid-through day is (the server has no prices), and only ever moves forward; a pilot's
  personal checkpoint is kept on their device.
- **Browser tests cover the flows end to end**: a book with history moving over, payments
  landing oldest first (short, exact, over), Settle up, late notices and the verify link,
  disputes and declarations, the ledger, and a closed month.

## Added 2026-11-21: linking money under one payment model

- **A pilot's payment links to a Payee, never to entries or days.** A Made Payment (wallet
  journal, or a contract paid in kind with the pilot's figure) is stored as a link to one Payee
  and pays that Payee's oldest unpaid days; what is over is credit. Assignments no longer carry a
  paid status or a payment. Suggestions only identify the recipient (the learned entity, then the
  name, across every record of a merged Payee), with no day window or entry checklist; amount alone
  never suggests a transfer the corporation's book holds or has in flight. An automatic match is one
  to one or nothing. A Default System may take over a day only after its Payee's paid-through.
- **A donation links to a Miner, never to a late notice.** One resolver,
  `functions/src/corpTaxBookDonationMatch.ts`, decides whose money a donation is, and the server
  runs it on every donation it stores, whichever sync sent it (a client's Miner is ignored).
  "Known" means grouped or seen mining, not "has paid before". An ambiguous donation is stored for
  review, shown in Needs you, and never claimed automatically. An officer can move a payment to
  another Miner. A hand-recorded payment is checked against uncounted and in-flight transfers so
  the same ISK is not counted twice.
- **One rule per question.** Whether two records are the same transfer, which Miner a Character
  is in (earliest grouping wins), and when money pays a day (the Running account, a date at a
  time) each have one shared definition, used by both sides.
