# Scope decisions — Corp Tax Book: a miner's "I paid it another way" stays a device-only note (issue #4643)

_Recorded 2026-10-21 · issue #4643._

- **"I paid it another way" stays a device-only note for the miner.** The overlap notice's button saves to that device only (`overlapAck.ts`). Officers never see it, and they settle the bill from the wallet journal as usual. Owner's choice (option A, for the B-UH rollout). This rules out a miner-side declaration callable, rules and officer UI. Revisit if officers ask for it.
