# Scope decisions — Ship Tree ladder: one search over every faction, fly state behind the funnel, factions under the toolbar (issue #4921)

_Recorded 2026-10-24 · issue #4921. Supersedes parts of `20261023-233332-ship-tree-ladder-filters-fly-state-in-the.md`._

- **The ladder's search is the map's: one box over every faction's hulls.** The per-faction "Search this faction" box and its "Other factions:" chips are gone. Picking a hull switches the tree to its faction and opens its Ship Info window. One search, the same on both views, instead of two that behaved differently.
- **Fly state moves behind the funnel, with Mastery.** All / Can fly / Can't fly keep their counts (the faction's own split) inside the filter box, and a pick away from All now counts towards the funnel's badge. This replaces the earlier decision to show it in the toolbar.
- **The funnel sits right beside the search box.** The view controls (Expand all, Collapse all, Legend) come after it, in `FilterBar`'s new `trailing` slot, so the row reads: view switch, search, filters, then the controls that only arrange the list.
- **The faction bar sits under the toolbar on the ladder.** The filters change its counts, so it reads as their result rather than as a picker above them. A phone's map keeps it above the map, unchanged.
