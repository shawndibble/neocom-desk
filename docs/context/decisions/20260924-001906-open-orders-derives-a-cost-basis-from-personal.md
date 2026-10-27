# Scope decisions — Open Orders derives a cost basis from personal wallet buys (FIFO) only when history covers every unit (issue #1422)

_Recorded 2026-09-24 · issue #1422._

- **Open Orders may derive a cost basis from wallet buys, FIFO.** This supersedes the "no automated FIFO reconstruction" rejection in `20260905-181537` for Open Orders only; Production Run realized profit stays a manual snapshot. It also ends the premise of `20260914-170542` that a build is the only route to a cost basis.
- **Pool rule.** Per (character, type): personal buys are lots, personal sells consume them oldest first, and the pool is the units on the character's unlinked personal sell orders of that type. Every order in the pool gets the weighted-average cost of the newest pool units, prorating a lot split at the boundary.
- **Refuse rather than guess.** If remaining lots fall short of the pool (`partial`) or a sell found no lot (`historyShort`), there is no basis, no floor and no verdict; the modal says which. A Production Run basis always wins and its orders are left out of the pool.
- **Buy-side broker fee is left out**, with a visible note on the floor and in the ledger.
- **Scope is checked up front** (no live 403): a character without the wallet scope silently gets no wallet basis and no re-auth banner. Wallet read failures also yield no basis.
- **Nothing new stored:** no Dexie table, no hand-entered cost.
