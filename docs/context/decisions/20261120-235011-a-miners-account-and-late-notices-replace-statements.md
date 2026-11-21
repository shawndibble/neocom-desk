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
  "Known" means grouped or seen mining, not "has paid before": a payer known only through earlier payments is not their own Miner, but a donation of theirs with no code goes to the Miner those payments named, and to review if they named more than one. An ambiguous donation is stored for
  review, shown in Needs you, and never claimed automatically. An officer can move a payment to
  another Miner. A donation from an alt pays the group the alt is in, as the alt is billed with
  it. A hand-recorded payment is checked against uncounted and in-flight transfers so
  the same ISK is not counted twice.
- **One rule per question.** Whether two records are the same transfer, which Miner a Character
  is in (earliest grouping wins), and when money pays a day (the Running account, a date at a
  time) each have one shared definition, used by both sides.

## Added 2026-11-21: the checkpoint is a strict cache

Refines "A closed-through date keeps the work bounded" above, after a review found edits to closed
days were silently dropped.

- **A checkpoint is a cache of history, never a record.** Raw data is kept forever, so a missing
  checkpoint only means a load recomputes from the full history. Any edit whose effective date is
  on or before a Miner's checkpoint (a payment, its move to another Miner, a write-off, an
  adjustment, a dismissal, a rate or record rate, a dispute answer, or any reversal) deletes that
  checkpoint in the same write, and so does any change to the Miner's characters. This replaces
  "a fix to a closed day is an Adjustment dated today": an officer can fix a closed day directly,
  as far back as the data goes, and the next load rolls the checkpoint forward again.
- **Only final history is checkpointed.** A checkpoint covers only days that are billable, priced
  at a saved close-of-day price, and read by a tab that sees the whole book. It stores each owed
  day's full tax and what was paid into it, and the characters it summed, so a rebuild is exact
  and one built for other characters is ignored.
- **The server checks what it can.** It has no prices, so it refuses a checkpoint that does not add
  up in itself, and one that owes less than the Miner's recorded account unless a Director sends
  it. A Director can reset a checkpoint; the next load recomputes it.

## Added 2026-11-21: reading old paid marks is passive and idempotent

A review found that reading old-client paid marks into payment links double-counted payments
and flipped paid days back for older clients.

- **A legacy link's id is stable.** It comes from the old payment's id (`legacy:<paymentId>`), or
  for a bare mark from the Assignment's id (`legacy:mark:<assignmentId>`), never from what the mark
  holds now. Its amount is the old payment's recorded amount. A mark read again finds the same link;
  a legacy link the pilot deleted stays deleted, since its tombstone is checked first.
- **Old marks are never written or cleared.** Assignments keep `status`, `payment` and `paidAt`
  exactly as older clients left them, so those clients see what they saw before. The new client
  only reads them, once each, into links.
- **A view never reaches a write.** Rows on screen carry a derived paid status; every write path
  re-reads the stored record before it saves, so a derived status is never stored as a mark.
- **Nothing that changes Assignments runs before links are known.** Takeovers, growth, coalescing
  and Ore Form repricing wait until the links collection has completed a pull for every tracked
  Character, so a device that has not seen the links yet never treats a paid day as unpaid.
- **Rules ship before the client.** The rules and indexes for the new collection are deployed
  before the merge (they are additive). A refused pull of a collection the rules do not know yet is
  treated as "not ready", not as a sync error.
- **An older client's unmark and re-record counts twice until the pilot unlinks one.** Confirmed
  by the owner: few users, and they upgrade almost at once, so no extra handling is built for it.

## Added 2026-11-21: a known limit on the officer's first read

- **The work per load is bounded; the officer's first read on a device is not.** A Running account
  is built from its checkpoint and the days after it, so no load recomputes closed history, and an
  officer's device keeps a copy of the book's mining rows and reads only what changed since. The
  first open on a new device still reads every row: a solo Miner with no checkpoint is found only
  by reading their rows, and Firestore cannot query "characters not in this set". Bounding that
  read needs a server-kept list of every character the book bills, or a checkpoint for every Miner
  who has mined; left for a later change.

## Added 2026-11-21: a lock date, and no copied reader lists (owner's decision)

Replaces "the checkpoint is a strict cache" and the copied `uids` on rows and payments.

- **History before the lock date is read-only.** The lock date is the 1st of the month two months
  back: on Dec 1 and on Dec 15 alike it is Oct 1. Nothing dated before it can be added, changed or
  removed (payments recorded or moved, adjustments, dismissals, rates, write-offs, disputes on
  those days): the server refuses the edit. Everything from the lock date up to today stays freely
  editable.
- **A snapshot is taken once per lock date.** When an officer opens the book and a Miner has no
  snapshot for the current lock date, the officer's tab records one: what that Miner's Running
  account stood at through the day before the lock date. A load reads the snapshot and the days
  after it. Since locked history cannot change, a snapshot never goes stale: there is no
  invalidation, no epoch and no Director gate. The one exception is a change to a Miner's
  characters (a grouping, an unlink): that deletes the affected Miners' snapshots, and the next
  officer load records them again. The snapshot is a `snapshot` field on the Miner's
  `accounts/{minerId}` doc, sent with its figures in one `recordAccounts` call. A pilot's personal Payees follow the same lock date on their
  device.
- **Wide dismissals and the start date respect the lock date too.** A Miner, moon or Extraction
  dismissal applies only from the lock date at the time it is made (`from`), and its reversal ends
  it only from the lock date at the time of the reversal; an Extraction wholly before the lock date
  cannot be dismissed. The book's start date cannot move before the lock date.
- **An open dispute on a locked day can still be answered.** A member cannot file or withdraw a
  dispute of a locked day, but an officer may dismiss or reject one already open: a snapshot keeps
  a held day aside (`held`, out of `balance`), so the answer settles only that day, after the
  snapshot. Otherwise a dispute crossing the lock date would stay in Needs you for good.
- **No copied reader lists.** Rows and payments are not given `uids`, and no queue maintains them.
  A pilot sees an alt's lines through the Mining Tax page's character selector ("All characters"),
  as before.
- **A warning when the corporation counts a character the pilot has not added.** The Mining Tax
  page reads only the Characters the pilot holds in Neocom Desk. When a book's Miner includes a
  Character the pilot does not hold (an officer grouped it with theirs), a thin warning bar says
  so on the Mining Tax page: "{corp} counts {character} as yours. Add them to Neocom Desk to see
  their mining and payments." with "Not yours? Tell {corp}", which declines the grouping
  (`declineLink`). One bar per corporation, naming every such Character; it goes once each is added
  or declined.
- **A declined grouping reaches the officers.** Besides its Activity entry and the Miner page's
  answer list, a Character declining a grouping puts an item in the officers' Needs you: "{character}
  says they aren't part of {Miner} — billed on their own now", linking to the Miner's page. It
  clears once an officer dismisses it or groups the Character again.
