# Scope decisions — Omega lapsed is inferred from the active skill's finish date doubling

_Recorded 2026-11-03._

- **`omegaLapsed` fires when the active skill's finish date moves out to at least 1.97x its remaining time between two recent polls.** ESI says nothing about Omega or Alpha (GLOSSARY.md **Clone State**), but Alpha trains at half the Omega rate and ESI re-projects the finish date when the rate changes, so a lapse shows as the same skill level finishing about twice as far away. It reads the skill-queue snapshot the poller already keeps, so no new fetch, scope or stored state.
- **Other slowdowns must not read as Alpha.** The previous poll has to be recent against the time left (remaining at least 4x the gap), which bounds how much a slowdown that landed earlier in the gap inflates the ratio to 2.25 for a halving; the threshold sits under 2 and above the 1.95 ceiling for an accelerator or implants coming off a weak attribute set. An accelerator lapsing in the same gap as Omega only raises the ratio, so both alerts fire. A queue edit (different skill, level or position), a paused entry or a speed-up fires nothing.
- **Assumption not yet seen in the wild:** that ESI recomputes `finish_date` on a lapse. If it does not, the alert simply never fires; it cannot misfire from this. The alert text says "looks like" and points to the Clone State setting, which stays the pilot's to change.
- **Foreground only, no Scheduled Push** (already happened). One occurrence per active skill level.
