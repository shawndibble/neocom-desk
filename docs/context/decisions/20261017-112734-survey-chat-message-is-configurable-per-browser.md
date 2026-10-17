# Scope decisions — Survey chat message is configurable per browser

_Recorded 2026-10-17._

- **The Survey chat message is configurable.** It always has the "Neocom Desk Report" heading line and the
  link row. Between them the pilot chooses, in "Configure chat message…" (the copy
  menu's caret), with a live preview: border (single `│`, double `║`, none; the
  border also picks the rail character), the ETA, the progress bar, the ore line
  (none, top 2, top 3, all; with or without rock counts), and optional location,
  mining pace, ISK left, volume left and time mining rows. The taper on the rails
  is always on, the box is never closed on the right (the proportional chat font
  never lined it up), ore names are always the full name (Brimful Zeolites is not worth what Zeolites is, so the quality prefix is never dropped), and notes are not offered. The choices
  are device-local (`useSurveyChatOptions`), like the price hub. A survey with one
  scan has no progress bar row.
