# Scope decisions — Move plan max ISK per haul is a device-local setting priced at the Trade Hub sell (issue #5165)

_Recorded 2026-10-25 · issue #5165._

- **The limit is a device-local setting (`movePlanMaxIskPerHaul`, `createLocalSetting`), not a synced one.** It is how much risk this pilot takes on a trip, like the active haul it shapes, which is also device-local. A synced key would add a plan-sync registration and an FAQ phrase for one number. It rules out following the pilot to another device; promote it to `createSyncedSetting` if that is asked for.
- **Value is the default Trade Hub's sell price** (`getHubPricesWithStatus(DEFAULT_TRADE_HUB)`, `sellMin`), read when a plan is worked out. That is the price Appraisal quotes and what the load costs to replace. No new price source. An item with no price counts as 0 ISK and the plan counts those stacks; an unreachable price feed shows a visible note, never a silent no-limit.
- **Over-limit stacks are reported apart from "won't fit this hauler".** A single unit worth more than the limit is never hauled; it is hull-independent, so it never changes hauler ranking and is not part of `unfitCount`.
- **The route honours the limit through the stacks.** `planHaul` fills a trip until its hold or its value is full, for pickups that carry priced stacks; a pickup with no stacks (a haul saved before this) has no values and is unlimited. The limit is saved on the `ActiveHaul` so a re-plan keeps it.
