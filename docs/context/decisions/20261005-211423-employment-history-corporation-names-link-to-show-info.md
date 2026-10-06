# Scope decisions — Employment History corporation names link to Show Info (issue #729)

_Recorded 2026-10-05 · issue #729._

- **Amends round 49 (`20260904-162201`): Show Info for a past employer is the corporation name, not a row menu.** Each Employment History row's name is a `CorporationLink` (an entity link that opens the Public Info Modal), so `CorpHistoryContextMenu` and its ⋮ (Copy name, Show info) are deleted: both items duplicated what the name now does or what the browser's own menu offers. The ongoing row still carries the `Current` badge and still never links to `/corp`.
- **Wallet's LP balances table loses the same menu.** Its name already links to Show Info and its trailing "Open store" link is the row's navigation, so no ⋮ and no caret.
