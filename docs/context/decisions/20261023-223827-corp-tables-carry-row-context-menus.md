# Scope decisions — Corp tables carry row context menus

_Recorded 2026-10-23._

- **Corp tables get a ⋮ / right-click / touch-and-hold menu where a row has two or more real actions not one tap away.** The owner wants row actions reachable from the table, including ones that lived only in the row-click modal or detail. §6c's restraint rules still decide each table; Show info, Copy and View in Market never count alone.
- **Got a menu.**
  - Members roster, Roles holders and Roles history: Show info, Open in EVE, zKillboard, Copy name for the member (`CharacterRowMenu`). Open in EVE and zKillboard are the two real actions.
  - Wallet transactions: the item menu (Quickbar, price alert, Compare, Open in EVE, Build Plan, View in Market, Show info) plus "Filter to this item".
  - Wallet journal (corp only, lines with a Player): Filter to this player, Filter to this type, and the player's actions. Lines without a Player have one action, so no menu; the personal journal gets none.
  - Moons › Extractions (officers): only rows with a survey-sourced ore and tax above zero, where both Change survey… and Dismiss tax… are real. An unknown-ore row already shows the visible Link button, a zero-tax Dismiss would be inert, and Notification ore has no survey: none of those get a ⋮ or right-click menu. Open moon page is the row click; a row without a ⋮ keeps its trailing caret, a row with one drops it.
  - Moons › Miners (officers): Record payment…, Send reminder (aria-disabled with reason), Dismiss tax…, Show info. Caret gone.
  - SRP officer Pending and Owed (claims with a figure): Change amount…, Show info, Open in EVE, zKillboard, Copy name. The ⋮ is a separate trailing cell after the row's Approve / Reject cluster, a trade-off accepted so the row's visible buttons stay one tap.
- **Accepted:** Open in EVE is inert without the Permission, so a user without it sees one real action (zKillboard) in the roster menu.
- **No menu, and why.**
  - Moons › Statements: no row click, and "Send this period" is already the visible run control above the table.
  - SRP officer History: only the pilot's actions, one real action.
  - SRP officer Approve, Reject, Mark paid, Copy amount and the killmail link: visible buttons on every row and card, so a menu would duplicate them (own-claim aria-disabled and the Mark paid confirm stay where they are).
  - /srp member claims and lost ships: Open detail is the row click, Re-file and File are visible buttons, Killmail link is the only extra.
  - Roster "View roles": the Roles tab has no member filter, so there is nothing to jump to.
- **Phone cards.** Dense cards (journal) set `dt-actions-pinned-only`; the officer queue uses `dt-dense-tight`; labelled cards (Extractions, Miners) use DataTable's own pinned ⋮.
