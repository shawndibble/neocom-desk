# Scope decisions — Structure broker fee is a hand-entered synced blob keyed by structure id (issue #2911)

_Recorded 2026-10-08 · issue #2911._

- **A structure's broker fee is the fixed 0.5% SCC surcharge plus the owner's percentage the pilot types.** Skills and standings do not reduce it, so it cannot be computed. Unset keeps NPC rules and is labelled "Assuming NPC station fees" (the amber assumed mark, DESIGN.md §6c).
- **It changes the relist floor and the fee ledger, not "if it sells as listed".** `orderFloor.fill` is tax only (the broker fee was paid at listing); only `relist` carries a broker fee, and Advanced Broker Relations still discounts it.
- **Stored as one synced settings blob (`sync.structureBrokerFees`, structure id to owner %), not a Dexie table.** Same trade as `sync.piCustomsRates`: whole-blob last-write-wins, no schema bump, no new synced collection. Entries are validated on read; an explicit 0 is a real fee.
- **No wallet prefill yet.** ESI's `brokers_fee` journal entries carry no order id, so linking one to an order would be a guess. `impliedOwnerPct` exists and is tested for when a reliable link is found; until then the pilot types the rate.
- **Realized profit stays at NPC rules.** A Production Run's watch record has no location, so the structure cannot be looked up there; adding it is a Dexie change left to a follow-up.
