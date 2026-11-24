# Scope decisions — Military Campaigns widget: rows, rings and the partly-granted mark (issue #6709)

_Recorded 2026-11-23 · issue #6709._

- **A joined turn-in objective the Character also holds items for is one row, not two.** It shows the holdings ("You hold 640 · ~37.1M turned in") and opens `TurnInDetail`. A joined turn-in objective with nothing held still opens `TurnInDetail` while its offer is Active; a joined objective of any other type opens nothing.
- **Rows with items to hand in come first, by what they pay; then the joined objectives by title.** Grouped per Character.
- **"Earned" is ISK plus LP as LP** ("2.4M ISK + 1,000 LP earned"), from the objective's own rates over the Character's contribution (`objectiveEarned`, capped at the per-Character maximum, LP in full blocks). LP is not priced here: pricing it would need an LP Value read for every paying corporation, and the row has no room for "unpriced".
- **A turn-in's reward counts LP at the header Character's Market hub** (`tradeHubIdFor`), the same LP Value the other turn-in surfaces use.
- **Held items come from the Assets page's cached read** (`loadCharacterAssets`), summed across every location. A Character without the assets scope simply holds nothing the widget can see; there is no second asset fetch.
- **Faction All draws one small ring per Active campaign in place of the figure** ("Caldari 1/4 · Amarr 1/4 …"), even when only one runs. With a faction chosen, the figure is "1 of 4 objectives complete" with one ring beside it. When nothing is waiting to turn in, the line under the figure names the campaign.
- **Partly granted: the header mark is for the first Character missing Military Campaigns, named "Mira Solenne and 2 more".** `GrantCellMark` grants one Character at a time; once that one grants, the mark moves on to the next. Hidden once Don't ask again; the needs-permission state (no Character granted) ignores it.
- **Rows stay single-line by truncating.** The objective keeps the row; the holdings column truncates at 8rem (5rem under a 24rem box, a phone), and the popover says in full what is held (`TableColumn.capped`). A Character whose own read failed drops its rows with a "N Characters couldn't be loaded" note; the header mark also shows on the empty state.
- **A campaign or objective the baked SDE file does not know is skipped**, not drawn and never a crash; it appears after the next bake. A row whose campaign has no known faction shows under All without a faction tag.
