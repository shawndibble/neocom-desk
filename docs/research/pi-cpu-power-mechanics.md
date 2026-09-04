# EVE Online Planetary Industry — CPU/Powergrid mechanics (2026) — research for pin allocation optimizer

Research-only note gathering facts for a future "pin allocation optimizer" feature
(how many extractor/factory pins a planet can run given its Command Center's
CPU/Powergrid budget). No algorithm design here — see companion tickets for that.

Method: ESI (`esi.evetech.net/latest`) queried directly for type/dogma data
(primary source, current live SDE), cross-checked against EVE University wiki,
CCP's own PI developer-docs page, and community forum threads. Every numeric
claim below has its source URL next to it. Anything not independently
confirmed from a primary source is explicitly flagged "unconfirmed" /
"community estimate" rather than stated as fact, per this repo's rule against
hardcoding unverified game constants.

## 1. Command Center CPU/Powergrid budget (base, all 8 planet types)

ESI dogma attribute IDs, confirmed via `/dogma/attributes/{id}`:

- Attribute **11** = `powerOutput` / "Powergrid Output" — https://esi.evetech.net/latest/dogma/attributes/11/
- Attribute **48** = `cpuOutput` / "CPU Output" — https://esi.evetech.net/latest/dogma/attributes/48/

Fetched `/universe/types/{id}/` for the currently-published Command Center of
each planet type (type IDs from EVE Ref group listing, https://everef.net/groups/1027,
cross-checked against fuzzwork's typeID lookup, https://www.fuzzwork.co.uk/api/typeid.php?typeid=2254&format=json
which confirms 2254 = "Temperate Command Center"):

| Planet type | Type ID | powerOutput (attr 11) | cpuOutput (attr 48) | ESI source                                          |
| ----------- | ------- | --------------------- | ------------------- | --------------------------------------------------- |
| Barren      | 2524    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2524/ |
| Gas         | 2534    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2534/ |
| Ice         | 2533    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2533/ |
| Lava        | 2549    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2549/ |
| Oceanic     | 2525    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2525/ |
| Plasma      | 2551    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2551/ |
| Storm       | 2550    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2550/ |
| Temperate   | 2254    | 6000.0 MW             | 1675.0 tf           | https://esi.evetech.net/latest/universe/types/2254/ |

**Finding: all 8 planet-type Command Centers have identical base CPU/PG** —
1675 tf CPU, 6000 MW Powergrid — confirmed directly from ESI's static dogma
attributes for every one of the 8 currently-published types. This is the
"Basic" profile (see §2); nothing in the type's own dogma attributes changes
per planet type.

None of the 8 types carry a `powerLoad`(15)/`cpuLoad`(49) attribute — i.e. the
Command Center itself does not consume CPU/PG from the colony budget, it only
supplies it. (Absence confirmed by inspecting the full `dogma_attributes`
array returned for each type above — no attribute 15 or 49 present.) This
matches EVE University's plain-language description: "A Command Center
provides Powergrid and CPU to your entire colony." —
https://wiki.eveuniversity.org/Setting_up_a_planetary_colony

Historical note: ESI also still serves now-**unpublished** (`published: false`)
type IDs like "Limited Barren Command Center" (2129), which carries `powerOutput:
9000, cpuOutput: 7057` — https://esi.evetech.net/latest/universe/types/2129/.
These numbers exactly match the "Level 1" row of the EVE University CPU/PG
table (below), confirming that before some past consolidation, each
Command-Center-Upgrades skill level corresponded to a separate deployable
item (Limited/Standard/Improved/Advanced/Elite), later folded into a single
per-planet-type item whose output is scaled dynamically by the pilot's skill
level rather than by swapping dogma-attribute-bearing types. This also
explains why ESI's static per-type dogma attributes only ever show the
level-0/Basic profile — the skill-scaled numbers are not encoded as
alternate SDE types anymore (see Open Questions).

## 2. Command Center Upgrades skill — CPU/PG effect per level

Skill type ID **2505**, confirmed via ESI:
https://esi.evetech.net/latest/universe/types/2505/
Description (verbatim from ESI): _"Each level in this skill improves the
quality of command facility available to you, in turn allowing for a greater
number of connected facilities on that planet."_

ESI's response for this type carries **no `dogma_effects` entries** — the
skill's CPU/Powergrid scaling is not exposed as an attribute modifier via the
dogma-effects mechanism the way, say, a ship module's attribute bonus would
be. This means the per-level CPU/PG numbers below could not be independently
derived from ESI/dogma alone; they come from EVE University's wiki table
(secondary source, unconfirmed against a CCP primary source):

| CC-Upgrades skill level    | CPU Provided | Power Provided | Upgrade cost (ISK) |
| -------------------------- | ------------ | -------------- | ------------------ |
| 0 (Basic, no skill needed) | 1,675 tf     | 6,000 MW       | —                  |
| 1                          | 7,057 tf     | 9,000 MW       | 580,000            |
| 2                          | 12,136 tf    | 12,000 MW      | 930,000            |
| 3                          | 17,215 tf    | 15,000 MW      | 1,200,000          |
| 4                          | 21,315 tf    | 17,000 MW      | 1,500,000          |
| 5                          | 25,415 tf    | 19,000 MW      | 2,100,000          |

Source: https://wiki.eveuniversity.org/Planetary_buildings ("Command Center
Properties" table). Level-0 and level-1 rows are independently corroborated
by ESI's live/legacy type data above (2254 → level 0 numbers; 2129 → level 1
numbers exactly), which gives fairly high confidence in the rest of the
table even though it's not ESI-sourced end to end.

**Mechanic characterized from this table (not a simple formula):** the
per-level increase is **not** a flat percentage and **not** additive in a
constant amount — it's a lumpy, front-loaded table (CPU roughly
+321% level 0→1, +72% level 1→2, +42% level 2→3, +24% level 3→4, +19% level
4→5; Power +50%, +33%, +25%, +13%, +12% for the same steps, computed from the
table above). CCP's own description language ("improves the quality of
command facility... allowing a greater number of connected facilities") is
consistent with a hand-tuned tier table rather than a % bonus applied
uniformly to a base value. **This specific numeric table is a secondary
source and should be treated as "best available" rather than primary-source
confirmed** — see Open Questions.

## 3. Per-pin-type CPU/Powergrid cost

ESI dogma attribute IDs, confirmed via `/dogma/attributes/{id}`:

- Attribute **15** = `powerLoad` / "Power Load" — https://esi.evetech.net/latest/dogma/attributes/15/
- Attribute **49** = `cpuLoad` / "CPU Load" — https://esi.evetech.net/latest/dogma/attributes/49/

Every pin type in the game is itself planet-type-specific (e.g. "Temperate
Basic Industry Facility" vs "Storm Basic Industry Facility" are different
type IDs). Fetched one representative planet-type variant per pin category
and confirmed the CPU/PG cost is identical regardless of which planet-type
variant is queried (spot-checked Barren/Temperate/Ice below — all match):

| Pin type                                | Example type ID (planet variant) | powerLoad (attr 15) | cpuLoad (attr 49)  | ESI source                                                                                       |
| --------------------------------------- | -------------------------------- | ------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| Extractor Control Unit                  | 2848 (Barren)                    | 2,600 MW            | 400 tf             | https://esi.evetech.net/latest/universe/types/2848/ (fetched via EVE Ref mirror, see note below) |
| Extractor Head (per head, up to 10/ECU) | n/a (sub-attribute of ECU)       | 550 MW (attr 1691)  | 110 tf (attr 1690) | same page                                                                                        |
| Basic Industry Facility                 | 2481 (Temperate)                 | 800 MW              | 200 tf             | https://esi.evetech.net/latest/universe/types/2481/                                              |
| Advanced Industry Facility              | 2480 (Temperate)                 | 700 MW              | 500 tf             | https://esi.evetech.net/latest/universe/types/2480/                                              |
| High-Tech Production Plant*             | 2482 (Temperate)                 | 400 MW              | 1,100 tf           | https://esi.evetech.net/latest/universe/types/2482/                                              |
| Storage Facility                        | 2562 (Temperate)                 | 700 MW              | 500 tf             | https://esi.evetech.net/latest/universe/types/2562/                                              |
| Launchpad                               | 2552 (Ice)                       | 700 MW              | 3,600 tf           | https://esi.evetech.net/latest/universe/types/2552/                                              |
| Command Center (self-cost)              | —                                | **none**            | **none**           | see §1 — no `powerLoad`/`cpuLoad` attribute present on any of the 8 CC types                     |

\* Current in-game/SDE name is **"High-Tech Production Plant"**, not
"High-Tech Industry Facility" as sometimes referred to informally — worth
noting since the task brief used the older/community name.

All of the above numbers were independently corroborated by EVE University's
"Planetary buildings" resource table
(https://wiki.eveuniversity.org/Planetary_buildings), which lists the exact
same figures under "Individual Building Resource Requirements" — full
agreement between ESI and the wiki on every value.

Note on the ECU fetch: the ESI type page for 2848 was retrieved through an
EVE Ref mirror rather than a direct `esi.evetech.net` hit in this pass;
everef.net serves the same SDE-derived dogma data (it's a well-known
ESI/SDE-data mirror, same convention as fuzzwork per the existing
`competitors.md` note on Fuzzwork). The values match the EVE University table
exactly, so cross-confirmed rather than single-sourced.

## 4. Extractor Control Unit yield/decay mechanics

This repo's `src/engine/pi/extraction.ts` doc comment (quoted verbatim):

> Extractor output across a program's life, from CCP's published decay curve
> (https://developers.eveonline.com/docs/guides/pi/ — decay factor 0.012,
> dogma attribute 1683; noise factor 0.8, attribute 1687).
>
> An extractor does not produce `qty_per_cycle` every cycle: output decays
> over the program, so the naive `qty_per_cycle x cycles` figure overstates a
> 14-day program by ~150%, and that program's last day yields 8.8% of its
> first. Every hour of a program is emphatically not worth the same, which is
> what a bare countdown to `expiry_time` implies.

**The decay formula itself is directly and exactly confirmed against the
primary source.** Fetched https://developers.eveonline.com/docs/guides/pi/
directly: CCP's page states (quoted from the fetch) the same constants,
`decayFactor = 0.012f` (labelled "Dogma attribute 1683 for this pin typeID")
and `noiseFactor = 0.8f` ("Dogma attribute 1687 for this pin typeID"), and the
same core formula:

```
decay_value = qty_per_cycle / (1 + t * decay_factor)
t = (cycle + 0.5) * bar_width
bar_width = cycle_time / 900.0
```

plus the cosine-ripple "noise" terms layered on top — matching
`extraction.ts`'s `cycleYield()` implementation term-for-term (`sinA`/`sinB`/`sinC`,
`phaseShift = qtyPerCycle^0.7`, `barHeight = decayValue * (1 + noiseFactor * sinStuff)`).
CCP's own page explicitly warns the constants are "defaults in
dgmAttributeTypes. They may change." — i.e. CCP itself treats 0.012/0.8 as
data-driven, not hardcoded-forever constants, which matches this engine's
choice to name them as exported constants rather than inline magic numbers.

**The specific "~150% overstatement for a 14-day program" / "8.8% of first
day" claim is NOT directly stated anywhere on CCP's dev-docs page** — that
page gives the formula but, per this session's fetch, contains **no worked
numeric example** (no 14-day walkthrough, no percentage figure). So this
specific number is presumably derived by whoever wrote `extraction.ts` by
actually running the formula, not quoted from a CCP-published example. I did
not re-derive the exact 150%/8.8% figures by hand in this research pass;
flagging as **plausible-but-not-independently-recomputed** here (see Open
Questions) — it is at least directionally consistent with two other things
found:

- A player-reported figure on the EVE Online forums thread "Excel &
  Planetary Industry" (https://forums.eveonline.com/t/excel-planetary-industry/439864):
  _"If you simply multiply [qty_per_cycle] by the number of cycles in the
  period (let's say for 1 day it will be 96 cycles), then the data will be
  overestimated by about 25%."_ — a **much shorter program (1 day, implying
  15-minute cycles) showing a much smaller overestimate (~25%)** than the
  repo's 14-day/~150% claim. These are not contradictory: the decay curve is
  monotonic in program length (`1/(1+t*0.012)` falls further the longer `t`
  runs), so a longer program should show a much larger cumulative
  overestimate than a 1-day one — the two data points are directionally
  consistent, just not a matching pair I could reconcile into one formula in
  this pass. This is a **community estimate**, not a CCP-published number.
- EVE University's "Setting up a planetary colony" page
  (https://wiki.eveuniversity.org/Setting_up_a_planetary_colony) gives an
  independent illustration of decay-by-program-length (not decay-within-a-fixed-program,
  but the same underlying mechanic showing longer programs yield less per
  cycle): _"With a one-hour program the first cycle pulled up 30,000 units.
  With a 24-hour program the first cycle only pulls up roughly 20,000
  units."_ This is a **different but related** effect from the in-program
  decay curve above — see next paragraph.

**How `qty_per_cycle` relates to underlying planet resource richness:**
`qty_per_cycle` as returned by ESI is _not_ a fixed property of the planet —
it depends on the **program length chosen at install time** (longer programs
spread the same extraction head's reach over more area/time and yield a
lower `qty_per_cycle` per the EVE University example above: 30,000/cycle at
1 hour vs ~20,000/cycle at 24 hours, same location). CCP's dev-docs page
identifies `qty_per_cycle` only as "the value as returned by ESI" and does
not explain its derivation from scan-point richness in the material this
session fetched. **I could not find a primary-source formula connecting scan
richness directly to `qty_per_cycle`** — flagged as an open gap.

## 5. Community best-practice guides

**EVE University wiki, "Planetary Industry"**
(https://wiki.eveuniversity.org/Planetary_Industry):

- On P3: _"With the new ECUs in Incursion it is no longer possible to do
  'perfect' P3 production on any planet — that is, continuously producing a
  P3 item at maximum output."_ (Incursion was a 2013 expansion — this is an
  old-but-still-cited mechanic note, not re-verified against current patch
  notes in this pass.)
- On P4: _"P4 items all need multiple planet types, from two to five"_; _"To
  build one unit of a P4 item you have to deal with two planets at
  least."_
- Extractor Control Units can have **up to 10 Extractor Heads** each (stated
  directly on this page).
- Launchpad CPU cost stated as 3,600 tf, matching the ESI-confirmed figure in
  §3.

**EVE University wiki, "Setting up a planetary colony"**
(https://wiki.eveuniversity.org/Setting_up_a_planetary_colony):

- Storage capacities: Command Center 500 m³, Launch Pad 10,000 m³, Storage
  Facility 12,000 m³ — matches ESI's `capacity` attribute (attr 38) values
  pulled in §3 (Ice Launchpad 10,000, Temperate Storage Facility 12,000)
  exactly.
- Worked example ratio: **one Extractor Control Unit feeding three Basic
  Industry Facilities**, with the explicit reasoning given as _preventing
  the Launchpad from filling up with (unprocessed) Microorganisms_ — i.e.
  the extractor-to-factory ratio in this example is driven by **keeping
  factory throughput ahead of raw-material storage overflow**, not by a CPU/PG
  optimization per se. This is the closest thing to an explicit
  "extractor pins → factory pins" rule of thumb found, and it's a
  single-example illustration, not a general formula.
- Interconnect/"link" capacity: _"A basic link can move 1,250 cubic metres
  per hour. Each upgrade doubles this to a maximum of 40,000 at level 5."_
  (This is link _throughput_, a capacity constraint distinct from CPU/PG —
  flagged since it interacts with pin placement decisions but is a different
  budget than CPU/Powergrid.)

**CCP developer docs** (https://developers.eveonline.com/docs/guides/pi/):
covers only the extraction decay formula (§4) — no CPU/PG mechanics, no
worked examples, no pin-count guidance found on this page.

**EVE Online forums, "Planetary Interaction - Does P2->P3 (or P4) ever make
sense?"** (https://forums.eveonline.com/t/planetary-interaction-does-p2-p3-or-p4-ever-make-sense/169050) —
community consensus (per this session's fetch, attributed to poster
"Do_Little" and others, all **community opinion, not verifiable game
mechanics**):

- _"If you're selling your PI, it makes sense to stop at P2. You can easily
  make profitable P2 items on individual planets with low maintenance."_
- _"P3 makes sense if you consume it yourself"_; _"P4 really only makes sense
  if you're building structures"_ (i.e. producing for your own
  structure-fuel/component needs, not for market sale).
- A P4 production line was described as needing _"12 (usually) p2 processors
  running for 4 hours"_ feeding it — a data point on factory-pin scale at the
  P4 tier, though it's one forum poster's setup, not a verified rule.
- One responder noted buffering a full P3 chain "requires approximately 9
  planets per P1 commodity" for some configurations — again a single
  community claim, not independently verified.
- Barren planets are informally preferred by some players for high-tier
  chains because their _"smaller radius means shorter links, which saves
  power grid"_ (from general web-search summarization of community
  commentary, not a single quoted primary post) — this is a **community
  estimate** about link/interconnect cost scaling with planet radius; I did
  not verify a link-cost-vs-radius formula against ESI/dogma in this pass.

**Other guides checked, found to be conceptual/non-numeric** (no new
citable figures beyond what's captured above): "A guide to planetary
interaction in EVE Online" (https://all-out.github.io/guides/planetary-interaction/),
"EVE Online Planetary Industry Guide: P0 to P4 Explained" (https://www.eve-hub.com/guides/eve-online-planetary-industry-guide).
Both describe the general P0→P4 processing chain, cycle-length tradeoffs
("short cycles give higher peak yield but demand more frequent resets; long
cycles are lower-maintenance but produce less per hour" — eve-hub) and
"unlock the full six-planet, fully-upgraded setup" as the CC-Upgrades +
Interplanetary Consolidation skill goal, but neither gave hard CPU/PG numbers
or a pin-ratio formula.

## Open questions / gaps

- **STILL OPEN, and the one number the shipped code leans on: the Command
  Center Upgrades skill's per-level CPU/PG table (§2) is not independently
  confirmed from a CCP primary source.** It is now hand-maintained in
  `scripts/build-sde.mjs` as `CC_UPGRADE_LEVELS`, with the same loud
  not-from-the-dump banner `P0_PLANET_TYPES` carries. The build asserts its
  level-0 row against the dump's own Command Center output, so a base-number
  change fails the build; levels 1-5 have no such check. Everything else
  §1-3 describes is now derived from the dump at build time (pin
  CPU/Powergrid from `powerLoad`/`cpuLoad`, capacity from `invTypes.capacity`,
  extractor-head cost from attributes 1690/1691, and each pin's planet type
  from `planetRestriction`), so this table is the single remaining
  secondary-source number in the payload. Re-verifying it in-game — the
  Command Center upgrade UI shows current and next-level CPU and Powergrid
  directly — is the cheapest way to close it.

- **Original wording of the above, kept for the trace:** ESI's
  `dogma_effects` for skill type 2505 came back empty, so the mechanism by
  which skill level scales a deployed Command Center's output could not be
  traced through ESI/dogma the way per-pin costs could. The level-0 and
  level-1 rows happen to be corroborated by matching unpublished legacy type
  IDs (2254 and 2129), which is reassuring but not proof for levels 2-5. If
  the optimizer needs these numbers to be bulletproof, they should be
  re-verified in-game (Command Center upgrade UI shows current/next-level
  CPU and PG directly) or against a more authoritative SDE dump.
- **No primary source found connecting scan-point resource richness to
  `qty_per_cycle` quantitatively.** Confirmed that `qty_per_cycle` varies
  with chosen program length (EVE Uni example) but not a formula tying it to
  the underlying richness value shown on the in-game resource scan overlay.
- ~~**The repo's specific "~150% overstatement for a 14-day program" / "8.8% of
  first day" figures were not found stated verbatim in any external source
  fetched this session**~~ — **RESOLVED, and it was already resolved in the
  repo when this note was written.** Both figures are reproduced to the unit
  by `src/engine/pi/extraction.test.ts` against CCP's own worked example
  (`qty_per_cycle` 6,965, 30-minute cycles, 14 days): the test pins the
  program total at CCP's published 1,874,985 units, the naive
  `qty_per_cycle x cycles` figure at 4,680,480, and their ratio at 2.4963 —
  i.e. the naive figure overstates by ~150%. The same test pins day 1 at
  513,262 units and day 14 at 45,254, which is 8.8%. Neither number needed
  an external source: they are consequences of the formula this note already
  confirmed exactly against CCP's page, and the test's expectations come from
  running CCP's own reference generator rather than from this engine. They
  remain consistent in direction with the community-reported
  ~25%-overstatement-for-a-1-day-program figure, as the monotonic decay curve
  requires.
- The sustained-rate figure this all exists to produce is
  `sustainedRatePerHour` in the same module: CCP's example averages to
  ~5,580 units/hour against the 13,930/hour `qty_per_cycle` alone implies.
  That is the number `chainCost` and `pinBudget` take as their
  `extractionRate`.
- **Link/interconnect power cost by planet radius** (the "barren planets
  save power grid via shorter links" claim) is unverified — no dogma
  attribute was traced for link cost scaling with distance/radius in this
  pass.
- **P3 "no longer possible to do perfect P3 production" claim** on EVE
  University is dated to the 2013 "Incursion" expansion era per the page's
  own phrasing; not re-verified against any current (2026) patch notes, so
  treat as possibly stale.
- Whether CC-Upgrades bonus applies **only to the Command Center's own
  output** or also indirectly affects anything else (e.g. link capacity,
  which EVE Uni describes as scaling "per upgrade" too) was not
  disambiguated — the "link capacity doubles per upgrade level" fact (§5) may
  or may not be the _same_ upgrade axis as the CPU/PG table in §2; this
  wasn't confirmed either way.
