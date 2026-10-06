# Scope decisions — Employment History corporation names link to Show Info (issue #729)

_Recorded 2026-10-05 · issue #729._

- **Amends round 49 (`20260904-162201`): Show Info for a past employer is the corporation name, not a row menu.** Each Employment History row's name is a `CorporationLink` (an entity link that opens the Public Info Modal), so `CorpHistoryContextMenu` and its ⋮ (Copy name, Show info) are deleted: both items duplicated what the name now does or what the browser's own menu offers. The ongoing row still carries the `Current` badge and still never links to `/corp`.
- **Wallet's LP balances table loses the same menu, and its row navigates.** The corporation name is the row's accent link to the LP Store (row action beats name link, so it is no longer a Show Info link), a trailing `RowCaret` closes the row, and the "Open LP Store" column is deleted. Show Info for the corporation moves to a "Corporation info" link in the LP Store page header. No ⋮.
