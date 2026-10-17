# Scope decisions — Survey chat message is configurable per browser

_Recorded 2026-10-17._

- **The Survey chat message is configurable.** It always has the "Neocom Desk
  Report" heading line and the link row. Between them the pilot chooses, in
  "Configure chat message…" (the copy menu's caret), with a live preview:
  - a Border checkbox with Single `│` / Double `║` beside it (unticked is no
    border). The border also picks the rail character. With none, the rails,
    taper and brackets go, and the ETA and link are plain rows;
  - the ETA, the progress bar, and the ore line (none, top 2, top 3, all; with
    or without rock counts);
  - one "Left:" line, directly under the bar, holding the percent left, the ores, the ISK value
    and the volume, the last two as just a number and unit;
  - optional location, pace and duration rows; short facts share a row when
    they fit.

  The taper on a rail is always on, the box is never closed on the right (the
  proportional chat font never lined it up), ore names are always the full name
  (Brimful Zeolites is not worth what Zeolites is, so the quality prefix is never
  dropped), and notes are not offered. The choices are device-local
  (`useSurveyChatOptions`), like the price hub. A survey with one scan has no
  progress bar row.
