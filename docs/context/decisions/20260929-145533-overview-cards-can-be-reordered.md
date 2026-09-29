# Scope decisions — Overview cards can be reordered

_Recorded 2026-09-29. Builds on 20260929-114130-overview-cards-can-be-hidden-by-the-pilot._

- **The pilot drags cards into their own order inside the board's edit menu.**
  Each row has a drag handle beside its show/hide checkbox. The pilot chose
  this over dragging the cards on the board itself: it keeps all board
  editing in one place and works the same on a phone. Keyboard reordering
  works too (space to lift, arrows to move, space to drop), and a screen
  reader hears each card's name and position.
- **The edit menu is a popover now, not a dropdown menu.** A menu's arrow-key
  item navigation would fight the drag handles' own keyboard moves.
- **Once the pilot sets an order, it applies on phones as well.** The pilot
  chose this over keeping urgency ranking on phones: their first two cards
  are always the full ones, whatever is on fire, including a card that would
  otherwise always fold to one line.
- **Until the pilot reorders, nothing changes.** An empty stored order means
  the built-in desktop order and the phone's urgency ranking. "Reset order"
  empties it and returns to both.
- **One synced list for the whole account** (`sync.overviewCardOrder`). Its
  own key, separate from the hidden list, so hiding a card on one device
  cannot roll back a reorder made on another. Like the hidden list, it keeps
  keys a build does not know. A card added later that the pilot never placed
  goes at the end.
- **Alerts has no place in the order.** On desktop it is a column beside the
  grid, not a slot in it. It stays in the menu, last and without a handle,
  for showing and hiding.
