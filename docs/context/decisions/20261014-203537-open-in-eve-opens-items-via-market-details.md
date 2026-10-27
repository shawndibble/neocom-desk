# Scope decisions — Open in EVE opens items via market details

_Recorded 2026-10-14._

- **An item's Open in EVE opens its market window, never an information window.** ESI documents `/ui/openwindow/information` for a character, corporation or alliance only; for an inventory type it answers 204 "received" and the EVE client does nothing (confirmed in game with Tritanium and a Neural Lace). Item modals and menus therefore send `marketDetails`. Rules out an item "Open in EVE" information entry. Station, structure and system uses of `information` are unverified and left as they were.
