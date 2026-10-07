# Scope decisions — A row's primary action beats name links inside it

_Recorded 2026-10-05._

- **When a row (or phone card) has a primary action, an entity name inside it is not a link.** The primary action is a click that opens a modal or detail pane, selects, or expands. The name stays plain text (the primary cell's accent cue marks it as the row's handle), and the entity link (Market, Show Info, Route Safety) lives in the opened modal or detail. Owner feedback on BPC Sourcing: clicking an item name jumped to Market instead of opening the contract modal the rest of the row opens. The #2677 sweep made every name a link, which hijacked the row. A name is a link only where the row has no primary action of its own, or where the name is the only action.
  The Entities table in DESIGN.md §6c applies to names in rows without a primary action; the accent style on a primary-cell name marks the row's own click, not a separate link. Pending: item names in rows without a primary action may open Show Info instead of Market.
