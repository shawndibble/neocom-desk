# Scope decisions — Owned stock container scope is an exclusion list; cross-plan reservation deferred (issue #2869)

_Recorded 2026-10-07 · issue #2869._

- **Container scope is an exclusion list.** A "selected locations" scope may carry `excludedContainers` (container `item_id`s); stacks inside them stop counting while the rest of that location still does. Exclusion rather than inclusion keeps every persisted scope, and a plan with new containers appearing, behaving as before. No Dexie schema bump: the field is optional and additive, and `ownedStockLocationKey` is unchanged.
- **Cross-plan reservation is deferred.** The Build Group's Group Owned Overlay already nets owned stock once against the Group Rollup, so the group total never buys twice; per-member reservation would need an allocation order, which the group-ownership decision rejected. The "member plan total differs from the group" hint shipped separately (#2942): `GroupOwnedDiffersHint` under the plan's Owned Material Source row.
