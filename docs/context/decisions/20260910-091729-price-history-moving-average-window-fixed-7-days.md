# Scope decisions — Price History moving-average window: fixed 7 days, 3 days on the 7d range (issue #730)

_Recorded 2026-09-10 · issue #730._

- **Price History's moving-average line uses a fixed 7-day window for the 30d/90d/1y ranges, and a fixed 3-day window on the 7d range — not a window that scales with the selected range.** A 7-day window over the 7d range itself collapses to a single point, restating `summarizePriceHistory`'s own mean as a line rather than showing a trend; a shorter fixed window avoids that without hiding the line. Ticket #730 explicitly left the exact window size as an implementer call to be eyeballed post-implementation ("a human should eyeball it once implemented and adjust if a fixed 7-day window looks too twitchy on a 1-year view"), so a scaling window (e.g. wider for 1y) is a live open question, not ruled out — a future ticket can revisit if a fixed 7-day window reads as too noisy on longer ranges.
