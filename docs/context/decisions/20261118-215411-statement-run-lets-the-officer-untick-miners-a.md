# Scope decisions — Statement run lets the officer untick Miners; a Miner mailed in the last 7 days starts unticked

_Recorded 2026-11-18._

- **The Check step lists every Miner in the run with a tick; only ticked Miners are mailed.** Lets an officer test one Miner. An unticked Miner's calendar-run Statement is still issued (periods bill whole) and stays on the "issued but never mailed" list for a later run; an unticked late notice is not issued, since notices are rebuilt each run.
- **A Miner mailed any Statement in the last 7 days starts unticked.** Stops double-mailing; the officer can tick them back. Read from the Statements' `lastMailedAt`.
