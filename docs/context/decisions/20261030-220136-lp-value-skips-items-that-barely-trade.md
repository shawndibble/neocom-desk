# Scope decisions — LP Value skips items that barely trade

_Recorded 2026-10-30._

- **A store's LP Value counts an offer only when its item trades at least a unit a day.** A thin market (DED and pirate stores) can show a real, high listed price that almost nobody buys at. Depth of listings did not catch it. The 30-day demand object does: units traded over 30 days, divided by 30. An item absent from a loaded demand object never traded, so it is left out. Demand unavailable means sales unknown: the offer stays in, and the value is not remembered, so the next ask retries instead of keeping an unchecked value for 15 minutes. The floor matches the landing's default "Sells at least 1 a day" filter. It rules out a per-store score for thinness; the offers themselves still show their own sells/day.
- **The Turn-ins count on the LP Store landing carries a desktop-only hint, not a tap-reveal.** A click on it opens the store like any other part of the row.
