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
- **The order applies on phones as well, always.** The pilot chose this over
  keeping urgency ranking on phones: the first two cards in the list are
  always a phone's full ones, whatever is on fire. A critical card further
  down still shows its news, in its folded line. The phone's urgency ranking
  is gone entirely, including for pilots who never open the menu.
- **No hidden second mode.** An earlier draft kept urgency ranking until the
  pilot first dragged a card. Review caught that dragging a card and dragging
  it back would leave an identical-looking list but a different phone. The
  pilot chose "always my order" instead, so what the menu lists is what every
  screen shows. "Reset order" returns the built-in order, and is disabled
  while the list already matches it.
- **One synced list for the whole account** (`sync.overviewCardOrder`). Its
  own key, separate from the hidden list, so hiding a card on one device
  cannot roll back a reorder made on another. Like the hidden list, it keeps
  keys a build does not know. A card added later that the pilot never placed
  goes at the end.
- **Alerts has no place in the order.** On desktop it is a column beside the
  grid, not a slot in it. It stays in the menu, last and without a handle,
  for showing and hiding.
