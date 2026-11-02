# Scope decisions — A row menu never carries Export table; menu items are grouped and folded by MenuGroup

_Recorded 2026-11-01._

- **A row menu never carries "Export table".** Export is a table action, not a row action, and as a row entry it made every item menu one longer. It lives in the table's title-bar `TableActionsMenu` (and a table with no row menus keeps its right-click export menu). Supersedes the earlier decision that every row menu grows an Export submenu.
- **Row-menu items are grouped, and the fold is by group, not by row.** `MenuGroup` ids run `primary`, `track`, `copy`, `game`; `track` and `game` ("In game") fold into a submenu at three or more items, other groups stay flat, hairlines go between non-empty groups, and submenus never nest. Folding by count of a given row's items was rejected: a menu's shape should be the same on every row. Quickbar sits in `track`; the Market page's own button covers it there.
