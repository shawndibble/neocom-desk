# Scope decisions — Corp Tax Book: a miner's "I paid it another way" stays a device-only note (issue #4643)

_Recorded 2026-10-21 · issue #4643._

- **"I paid it another way" stays a device-only note for the miner.** The overlap notice's button saves to that device only (`overlapAck.ts`). Officers never see it, and they settle the bill from the wallet journal as usual. Owner's choice (option A, for the B-UH rollout). This rules out a miner-side declaration callable, rules and officer UI. Revisit if officers ask for it.

_Superseded 2026-11-15 by `20261115-125600-corp-tax-book-a-miner-declares-and-disputes` (#6206): officers asked, and the declaration now reaches them._
