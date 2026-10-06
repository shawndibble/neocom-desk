# Scope decisions — Characters table: Remove folds into the row menu (issue #2077)

_Recorded 2026-10-05 · issue #2077._

- **Reverses `20260927-071415`'s "Remove is a trailing danger column, not a menu item".** The table's `remove` column is gone; Remove is now the last item of `CharacterRowContextMenu`, set apart by a separator and styled danger, opening the same confirm dialog. A danger × beside the ⋮ is a mis-tap hazard and a second trailing cluster (`rows-get-controls-by-context-not-by-rule`). The ⋮ stays: five real destinations. The card's separate × stays — a card has no ⋮ to fold it into.
- **Everything else in `20260927-071415` stands**: the `group` column and filter, flat table, group management card-view only. A stored `charactersVisibleColumns` still listing `remove` has it dropped on read rather than being rejected.
- **Employment History: the corporation name is a Show Info entity link, not a row menu.** Amends round 49 (`20260904-162201`): Show Info for a past employer is the name link (`CorporationLink`), so the `CorpHistoryContextMenu` and its ⋮ (Copy name, Show info) are deleted. Wallet's LP balances table loses the same menu; its name already links to Show Info and its trailing "Open store" link navigates.
