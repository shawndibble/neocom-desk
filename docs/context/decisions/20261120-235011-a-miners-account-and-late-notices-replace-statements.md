# Scope decisions — A Miner's account and late notices replace Statements

_Recorded 2026-11-20._

Builds on decisions 20261117-033049, 20261117-043246 and 20261117-060555 (every Corp Tax Book is a
running account).

- **"Statement" leaves the system.** Every book is a running account and production holds no
  calendar Statement: every `corps/{id}/statements` doc is a late notice (`kind: 'notice'`). The
  calendar Statement engine (cadence, periods, the minimum and its roll-over, the 100k tolerance
  floor, payments settling one Statement, frozen Statement lines) is dead code, and it goes. No
  data is converted, because there is none to convert.
- **Two objects replace it, each doing one job.** The **account** (`buildAccount`,
  `src/engine/corpTaxBook/account.ts`) bills every closed day and pays the oldest unpaid day
  first; it is the one thing a screen, a notice, a total or the verifier reads for what a Miner
  owes. A **Notice** (`Notice`, `functions/src/corpTaxBookNotice.ts`) is only a record of what was
  asked: its lines, who issued it, its mail state. It takes no money, has no amount to settle,
  and is settled once every day it listed is (`noticeStanding`). Rules out renaming Statement in
  place, which would keep a bill's fields (period, coverage, hub, Ore Form, priced lines, a code
  that pins money) on a thing that is not a bill.
- **Plain types and pure functions, not classes.** `src/engine` stays pure, the Notice rule is
  shared with the Cloud Functions (decision 20261117-230113), and Firestore docs and read models
  are plain JSON: a class would be rebuilt and torn down at every boundary.
- **One payment code per Miner** (`minerPaymentCode`), since money pays the oldest day whatever
  code it carries. Codes on notices already mailed stay recognised.
- **Rollout, additive first** (dev and production share one Firebase project): (1) the account
  and Notice engine beside the old code, `allocateRunningAccount` on the same day-settling core
  and a property test that the two agree on books with no Statements; (2) a `notices` collection
  with its rules, server actions and a backfill from `statements`, mirrored back to `statements`
  for older tabs; (3) the client reads `notices` and every UI string, route and i18n key says
  late notice, with old verify links and codes still working; (4) the calendar Statement code and
  the Statement-built totals (`minerTotals`, the Miners list, the overview) are removed or rebuilt
  on the account, and a Miner's page reads from their paid-through day; (5) after a soak, the
  `statements` mirror, its rules and the legacy server fields and actions go; (6) the glossary,
  ADRs and decisions are rewritten without Statements.
