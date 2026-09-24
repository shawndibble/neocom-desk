# Scope decisions — Settings Corporation permission row offers Grant for not-granted (issue #1524)

_Recorded 2026-09-24 · issue #1524._

- **The Corporation row offers Grant for `not-granted` as well as
  `roles-without-grant`.** It is still hidden for `none`, so a line member is
  never offered a grant that unlocks nothing. The roles scope is inside the
  `corp` Permission (20260910-123303), so before a grant nobody can tell a
  line member from a Director. Hiding the row in that state would leave no way
  in at all. This refines the "offers Grant only for `roles-without-grant`"
  line in 20260924-143410.
