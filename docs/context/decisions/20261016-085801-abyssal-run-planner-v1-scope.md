# Scope decisions — Abyssal run planner v1 scope

_Recorded 2026-10-16._

- **The planner is a "Plan an Abyssal run" disclosure under the Fitting editor's weather picker, not a new page.** The question is asked of the open fit, and the weather it needs is already a session pick shared by every number on the page. It writes that same pick (`useAbyssalWeather`), so the planner and the stats heading can never disagree; it adds only the filament tier and the activation security (`abyssalRunPlan.ts`, not saved).

- **A tier rolls two weather strengths, so the planner never maps a tier to one beacon level.** T0-T3 roll level 1 or 2 (30/50%), T4-T6 level 2 or 3 (50/70%), per the EVE University wiki; an older forum thread gave fixed per-tier values and is not followed. Changing the tier keeps the weather and snaps to the harsher strength the tier can roll. Picking a strength the tier doesn't roll is allowed and noted.

- **Weather effects come from the engine's beacons, never hardcoded.** The before/after is the editor's own evaluation run twice (normal space, then the weather), shown with the Variations stat diff (`diffFittingStats` and `changeLabel`) plus the longest turret reach, which that diff lacks.

- **Hull eligibility is a hand-picked table of inventory groups.** No filament carries an allowed-hull attribute in the SDE (only tier, attribute 2761, and weather, 2760). Cruiser-size groups fly alone, destroyers go up to 2, frigates up to 3, Tech 3 cruisers are barred, battlecruisers and up are too large, and any other group says "no rule known". Interdictors and Command Destroyers count as destroyers without a wiki mention. Filaments to buy equal the ships.

- **Suspect-flag rules follow the post-2022 table, with the 2026 T0 change.** 1.0 and 0.9: T0 only. 0.8 flags T4+, 0.7 T5+, 0.6 T6, 0.5 none. Below 0.5 there is no flag (no CONCORD), though anyone may attack. Security is picked as a band, not typed.

- **v1 excludes:** loot and mutaplasmid expectations, run profit, pocket-by-pocket NPC damage types, Proving Grounds filaments, wormhole space, and saving a plan with the fit or in a Fitting Share Code.
