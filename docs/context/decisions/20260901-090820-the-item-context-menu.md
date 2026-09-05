# Scope decisions (round 16)

_Recorded 2026-09-01._

- **The item context menu (round 6) reaches the Assets page and gains a
  sixth action.** `ItemContextMenu` is now also the Assets tree's row menu
  (issue #83), not just the Market Browser's — so add to Quickbar, show
  info, compare, copy name and jump to Build Plan all work identically
  there. The new action, **View in Market**, jumps to the Market Browser
  with the item preselected, carrying over an existing region/hub URL param
  if the trigger page already had one. Assets rows also gain a hover
  tooltip (name, icon, quantity, estimated value, volume) — physical volume
  reads from the same slim SDE snapshot as everywhere else, so a type it
  doesn't cover (a market/asset-only type) shows as unknown rather than
  paying for a live ESI call per hover.
