# Scope decisions — Abyssal run planner v1 scope

_Recorded 2026-10-16._

- **The planner is a "Plan an Abyssal run" disclosure under the Fitting editor's weather picker, not a new page.** The question is asked of the open fit, and the weather it needs is already a session pick shared by every number on the page. It writes that same pick (`useAbyssalWeather`), so the planner and the stats heading can never disagree; it adds only the filament tier and the activation security (`abyssalRunPlan.ts`, not saved).

- **A tier rolls two weather strengths, so the planner never maps a tier to one beacon level.** T0-T3 roll level 1 or 2 (30/50%), T4-T6 level 2 or 3 (50/70%), per the EVE University wiki; an older forum thread gave fixed per-tier values and is not followed. Changing the tier keeps the weather; a strength the new tier can't roll snaps to its harsher one. Picking a strength the tier doesn't roll is allowed and noted.

- **Weather effects come from the engine's beacons, never hardcoded.** The before/after is the editor's own evaluation run twice (normal space, then the weather), shown with the Variations stat diff (`diffFittingStats` and `changeLabel`) plus the longest weapon reach the weather moved, which that diff lacks. The source tiers come from the EVE University wiki (T0 usable in 1.0/0.9 since 2026-05-19, fixed 2026-06-16) and the SDE (attribute 2761 is the tier, 2760 the weather).

- **Hull eligibility goes by the app's existing hull-size tables.** No filament carries an allowed-hull attribute in the SDE. The size comes from the D-Scan hull ranks (`hullRankOf`) and the wormhole size table: cruisers fly alone, destroyers go up to 2, frigates up to 3, Tech 3 cruisers are barred, battlecruisers and up (capitals and freighters included) are too large, and any other group (Rookie Ships and Flag Cruisers included) says "no rule known". Interdictors and Command Destroyers count as destroyers, but no source names them, so the planner says so and points to the game. Destroyer and frigate traces take 2 or 3 filaments of the same type "in a single ship's cargohold" and "only a fleet can activate it" (EVE University wiki), even flown solo; the planner says that, and hides the filament to buy for a hull that can't enter.

- **Suspect-flag rules follow the post-2022 table, with the 2026 T0 change.** 1.0 and 0.9: T0 only. 0.8 flags T4+, 0.7 T5+, 0.6 T6, 0.5 none. Low and null security have no flag ("0.5 (and all low/null): everything clean", downthechain.net; the wiki only warns to "consider where you use the filament, especially in low security and null security space"), so the planner says no CONCORD protects the trace there rather than calling it clear. Wormhole space and Pochven are not claimed either way. Security is picked as a band, not typed.

- **v1 excludes:** loot and mutaplasmid expectations, run profit, pocket-by-pocket NPC damage types, Proving Grounds filaments, wormhole space, and saving a plan with the fit or in a Fitting Share Code.
