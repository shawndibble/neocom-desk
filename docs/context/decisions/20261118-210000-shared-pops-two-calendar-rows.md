# Scope decisions — Shared pops: two Calendar rows, the second muted

_Recorded 2026-11-18. Supersedes the "one Calendar row" wording of `20261118-191947-shared-pops-one-calendar-row-both-pop-times`._

- **A Shared Pop is two rows: a pop row on the Pop Time and a muted row on the belt's expiry.** One row that jumped to the expiry after the pop left the Pop Time's day empty, and a pilot who joined late saw nothing for the day the moon popped. The pop row stays on its day once popped and reads "Popped" (the Started pattern of a calendar event); the other row reads "belt expires" and, past it, overdue. Both rows exist before the pop too, so the belt's end is on the map from the start.
- **Same kind, same filter, same glyph.** The expiry row differs only in tone: its glyph and countdown are grey (`text-text-dim`), not the sand of the pop row. The map and Day Ticker mark days by kind, so they still show the one sand glyph. One "Shared moon pops" filter entry covers both.
- **A fully mined moon keeps only the pop row**; nothing is left to expire. The "likely mined out" guess labels the expiry row.
- **Both rows open the same detail** (`detailId`); the `?pop=` link now lands on the Pop Time's day.
- **No new notification.** Shared Pop notifications stay on the Pop Time; nothing fires at the expiry.
