# Scope decisions — Group Rollup verdict is unknown while any member is missing (issue #2040)

_Recorded 2026-09-26 · issue #2040._

- **A Group Rollup's verdict, profit, build cost and buy cost are unknown while any member has no settled result.** The Industry list row and the Build Group page both read `computeGroupRollup` (`groupRollupView.ts`), so they cannot disagree. Previously the page summed whatever members had settled and presented a partial total as a whole. The page still lists settled members, failure lines and the merged tables; only the totals and verdict go unknown. The signed `savings` stays separate from `verdict` so an unpriceable-but-signed group still words "BUILD is cheaper" correctly.
