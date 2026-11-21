# Scope decisions — The late-notice run lets the officer untick Miners; a Miner mailed in the last 7 days starts unticked

_Recorded 2026-11-18._

- **The Check step lists every Miner in the run with a tick; only ticked Miners are mailed.** Lets an officer test one Miner. An unticked late notice is not issued, since notices are rebuilt each run. (A calendar bill, when there were any, was still issued for an unticked Miner and waited on the "issued but never mailed" list; decision 20261120-235011 removed the calendar bill.)
- **A Miner mailed any late notice in the last 7 days starts unticked.** Stops double-mailing; the officer can tick them back. Read from the notices' `lastMailedAt`.
- **A running account's late-notice rules gain an optional "send early at" amount (`noticeRules.earlyAt`, off when blank).** A Miner (all their Characters together, as `owes` already is) owing at least that is due a notice before the days / day-of-month rule is met. The days between notices still holds first, so nobody is asked twice inside it. Additive and optional, so older clients and the shared Firebase data keep working.
