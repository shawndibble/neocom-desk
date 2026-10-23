# Scope decisions — Skyhook raid windows: reuse sovRaid on the corp board, new skyhookRaid Clock Kind on the Calendar (issue #4784)

_Recorded 2026-10-23 · issue #4784._

- **<Decision>.** <Why, and what it rules out.>

- **The corp board reuses the existing `sovRaid` kind for skyhook theft windows** (shipped with #4775). No corp `skyhookRaid` kind is added: `corpDeadlines`, the Deadline Strip and the header `Next` already carry those windows, with severity from the time remaining (`severityForRemaining`, ranked by opening while ahead and closing while open). Tests added in `engine/corp/board.test.ts` and `corpClockModels.test.ts`.
- **The Calendar gains a tenth Clock Kind, `skyhookRaid`** (the ticket said "ninth"; `moonChunk` made nine). Read from the same cached corp skyhook reads as the Sovereignty widget, gated in the loader like `moonChunk` (`canReadSkyhooks`); a Character without it contributes nothing and the filter menu hides the row. Deadline rule matches `sovRaid`: the window's opening while ahead, its close while open; a closed window is dropped.
- **"Silo fill" is stock in units, not a percentage.** ESI sends no silo capacity, so the modal shows unsecured and secured units (unknown, never 0, when unreadable) and says so in a note.
- **Colour:** `--color-kind-skyhook-raid: #d9a7a0` (dusty clay; ΔE ≥ 23 from every clock kind, ≥ 41 from the status tones, AA 9.20 / 8.64 / 8.06). Glyph is the PI skyhook icon.
- **Row click opens the corp Sovereignty widget's `RowDetailModal`** (system, stock, window start and end, Set destination), not `EventDetailModal`, which is calendar-event specific; the Coming Up rail row is the only entry, as for calendar events.
- Raider-side public-list windows are not calendar items.
