# Scope decisions — Corp assets is an inventory ledger, not a division tree (issue #4671)

_Recorded 2026-10-21 · issue #4671._

- **Reverses `20260910-152158-corp-assets-rejoin-the-shared-tree-engine-via.md`** (and with it
  rounds 41/44). `/corp/assets` is no longer a division-first drill-down over the shared tree
  engine. Directors and asset managers come to it to ask "do we have enough of X, where is it,
  and what is stuck in Impounded or Asset safety", which a station › division › container browser
  answers badly; the third-party corp tools surveyed (jEveAssets stockpiles, SeAT market seeding)
  all centre on stock against a target. The page is now a ledger: state tabs mirroring the
  in-game window, a by-item view with stock targets, and a by-location view.
- **The tab is the path, the view is the query.** `/corp/assets[/offices|deliveries|in-space|
impounded|safety|lockdown|capsuleer-deliveries]`; `q`, `group=location`, `loc`, `div`, `cat`,
  `below=1`. The bare path is All, so the page is not a `PAGE_TABS` page (that registry redirects
  the bare base to a default tab); an unknown path, i.e. an old tree deep link, redirects to
  `/corp/assets` keeping the query.
- **Category is the top-level market group.** The slim SDE has category ids but no category
  names, and the market catalogue has named groups, so the Group column and the `cat` filter use
  a type's root market group id. A type outside the market catalogue has no category.
- **Count badges may carry a tone.** `Tabs` gains `countTone` (`warning` for Corp deliveries,
  `danger` for Impounded and Asset safety) — an exception to §6c's neutral count badge, because
  these counts are the page's point; the number still prints.
- **Dead code removed with the tree.** `buildCorpAssetTree`, `corpAssetLocationId` and
  `engine/corp/assetPath.ts` had no other caller. `buildAssetGroups` stays in `engine/assetTree.ts`.
