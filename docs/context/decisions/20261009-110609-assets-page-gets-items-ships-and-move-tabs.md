# Scope decisions — Assets page gets Items, Ships and Move tabs

_Recorded 2026-10-09._

- **The Assets page has three tabs: Items, Ships, Move.** My ships and Plan a move were page-sized panels (a slide-in and a modal) hidden in the Tools menu; they are now `/assets/items`, `/assets/ships` and `/assets/move` (ADR 0015). Tools no longer lists them. The page stays one mounted route, so the Character filter, jump basis and loaded assets carry across tabs and the query string rides every tab switch.
- **The drill-down moves under Items: `/assets/items/<locationId>/...`.** The Items tab is declared `deep`, owning every path below it. Old `/assets/<locationId>/...` links and `/assets?view=ships` redirect (replace) to their new homes; nothing else about an old link is lost.
- **Item-only controls (search, Select, All items, Tools) show on the Items tab only.** Ships and Move carry the page header and tab bar alone; the header's Character filter drives both. Leaving Move (Cancel, Done) returns to Items, and re-entering starts a fresh plan.
