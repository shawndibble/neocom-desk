# Scope decisions — Omega coverage scales account cost to the widget range (issue #3934)

_Recorded 2026-10-16 · issue #3934._

- **Account cost scales to the widget window.** Owner chose scaling one account's cost to 7/30/90 days (option B) over converting net income to 30 days; the figures compared stay the ones the pilot sees.
- **PLEX per 30 days stays per 30 days.** The setting is unchanged; the widget scales it by days / 30.
- **Periods reach back as far as local history.** Count is ceil(archive days / window), bounded by the oldest journal row, not a fixed cap.
