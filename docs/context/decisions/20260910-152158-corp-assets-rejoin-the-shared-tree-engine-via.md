# Scope decisions — corp assets rejoin the shared tree engine via a division node (issue #779)

_Recorded 2026-09-10 · issue #779._

- **Reverses round 41/44** (`20260903-162701-corp-assets-are-registered-and-assets-gets-no.md`,
  `20260903-212133-corp-assets-division-first.md`): `/corp/assets` now
  browses through the same shared, pure tree engine `/assets` uses
  (`engine/assetTree.ts`), not its own flat `groupCorpAssets`/`DataTable`
  grouping. Round 41's blocking reasoning — no grouping level between a
  station and a container, and no `item_id` to key a division on — didn't
  account for the fact the engine already solves an identical problem for
  bay nodes: `AssetTreeBayNode` groups a ship's children by `location_flag`
  and is addressed by kind (`b:${bay}`) rather than an asset id it doesn't
  have. A division node uses exactly that mechanism at a different fan-out
  (seven fixed divisions instead of up to three bays).
- **New shared primitive, not a corp-only fork.** `buildAssetGroups<Id>`
  (`engine/assetTree.ts`) generalizes `buildAssetTree`'s root-grouping pass:
  callers supply the top-level grouping key, fixed order, and which ids
  always appear even empty; the container/ship/bay recursion beneath each
  root (`buildNode`/`sumNodes`) is unchanged and untouched by this ticket —
  `assetTree.test.ts`'s existing suite stays green. `engine/corp/assetDivisions.ts`'s
  `buildCorpAssetTree` is now a thin adapter: `CorpAssetInput` (widened to
  carry `location_type`, which `toCorpAssetInputs` already had available from
  `CorporationAsset` and simply wasn't forwarding) maps to `EngineAsset`, and
  `corpAssetGroupId`/`HANGAR_DIVISIONS`/`ALL_CORP_ASSET_GROUP_IDS` supply the
  grouping key and fixed order.
- **URL scheme: a parallel corp module, not a fork of `assetPath.ts`'s
  public API.** `engine/assetPath.ts` gained one extraction —
  `walkAssetTreeSegments`, the container/bay/item drill-down walk — shared by
  both `resolveAssetPath` (personal, station-keyed, unchanged behavior) and
  the new `engine/corp/assetPath.ts` (`resolveCorpAssetPath`/
  `parseCorpAssetPath`/`corpAssetPathHref`, keyed by `CorpAssetGroupId`
  instead of a numeric station id). A corp module rather than a generic
  parameterized `resolveAssetPath` because corp assets have no device-local
  "current owner" to key a station id on the way `/assets` does (round 44's
  point on this specific detail still stands) — only the top-level key
  differs, so only that layer forks.
- **Root-level grouping key is `location_type !== 'item'`** (an asset not
  nested inside another owned asset), same predicate `buildAssetTree`'s own
  real-root pass already uses — not "matches a division/flag pattern at any
  depth". A container placed in a division nests its contents beneath it via
  the ordinary `location_id` → parent `item_id` recursion, rather than each
  nested row being flag-bucketed on its own (which is what the old flat
  `groupCorpAssets` did, and which search on this page would otherwise have
  no drill-down link to send a hit to). Verified with a conservation test in
  `assetTree.test.ts` — every input asset lands as a node exactly once
  across the built groups, nested or not — since a wrong root predicate would
  silently drop or duplicate real corp holdings, the one failure mode
  `assetDivisions.ts` has always explicitly ruled out.
- **Blueprint/build-plan linking stays explicitly disabled**
  (`blueprintTypeID={null}` in `CorpAssets.tsx`'s row wrapper) rather than
  wired up — corp assets still never loads the blueprint catalog; this
  ticket didn't add that fetch.
- **`engine/corp/assetDivisions.ts`'s `groupCorpAssets`/`filterCorpAssetGroups`/
  `CorpAssetGroup`/`CorpAssetRow`/`corpAssetItemName` are removed**, not kept
  alongside the new tree — nothing outside the old route and its own test
  referenced them (checked, issue #779's PR), and CLAUDE.md rules out
  backwards-compatibility shims for code with no remaining caller.
  `features/corp/assetsExpandPreference.ts` (the `Disclosure` expand/collapse
  persistence store) is removed the same way: URL-addressed drill-down
  replaces it, and nothing else imported it.
- **Deliberately still narrower than `/assets`**: no cross-character merge
  (a corporation has exactly one asset list, not one per character — not
  applicable), no station pinning, no security/jumps-away badges, and no
  permanent "all items" flat toggle (search already flattens on demand). None
  of these are named in issue #779's acceptance criteria; adding them was
  judged out of this ticket's scope rather than silently dropped — flagged
  here so a future ticket doesn't have to rediscover the gap from the diff.
  The Personal/Corporation switch on `/assets` itself is still not reopened
  (round 38, `20260903-154003-the-personal-corporation-switch.md`) — that
  objection is about `/assets`'s own device-local-owner state, independent of
  the tree-engine limitation this decision reverses.
