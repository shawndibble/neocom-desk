# PI tabs: Plan, Map and Colonies

Design spec for the three Planetary Industry tabs. The Advisor tab retires.
Scope: [decision 20261005-114103](../../context/decisions/20261005-114103-pi-section-becomes-plan-map-and-colonies-tabs.md).
Published review page: <https://claude.ai/artifact/6Ms9osyfLW5nDAh1QNo9e5>.

**Cadence.** The refs assume the app default: restart extractors every day, haul every day (volumes are per day). The pilot can change both in PI settings; the app does not default to a 3-day restart or a weekly haul.

## Who each tab serves

1. **"I have planets. What do I do with them?"** This is the most common question. **Plan** ([plan.html](plan.html)) opens here when the pilot has colonies: quick wins first, then rebuilds as an alternative, then an in-game checklist.
2. **"What's the best thing to build, and which planets do I need?"** Plan opens here without colonies: ranked one-planet setups and nearby systems with the planet types. **Map** ([map.html](map.html)) is the visual explorer: planet types against product tiers, with what-if planets.
3. **"I need this specific product."** This is the existing Goal Planner, kept behind Plan's "Make a specific product".

**Colonies** ([colonies.html](colonies.html)) is the daily check: what to do next, by when, and which colonies need a look.

## New-player panel

Four AI agents role-played new players (new Omega, lowsec hauling-hater, nullsec with no planets, phone-first casual). All ranked the coach first, recipe cards second and the map last ("a circuit board"). Their asks went into Plan:

- one sentence per planet;
- "you can run up to 6 planets";
- hauling shown as risk (which ship it fits in, lowsec jumps);
- a real no-planets start with corp buyback pricing and a P2 filter;
- "Show me how" opening right where you tapped.

Three of them re-tested Plan and scored it 8, 8 and 7 out of 10.

## Deliberate differences (not built)

Five places where the app intentionally departs from these mockups, so a review should not flag them. Recorded in [decision 20261005-210436](../../context/decisions/20261005-210436-pi-design-refs-deliberate-differences-not-built.md):

- phone Map shows a tier list, not "Your best moves" / the trace (`map-phone*`);
- no "What matters more" on Find best (it lives on Make more only);
- no popover linking to the 60-second explainer; "New to PI?" opens the drawer directly;
- no planet diagram in "Show me how" (`plan-q2-show-me-how-*`);
- the Map "have" tag stays boxed.

## Reading the mockups

The sample pilots, nearby systems ("Sample system A") and alt characters are illustrative. Every number comes from a toy model: a flat 6,000 raw/h per planet, 10% customs and a Jita price snapshot. The app uses the real engine. **Verify against these mockups for structure, order, wording, icons and states, not numbers.**

Open from disk; icons load from `images.evetech.net`. The "Mockup only" switcher picks the sample pilot, shared across tabs via localStorage `piMock.pilot` / `piMock.market`.

## Design rules (summary)

The full rules are in [DESIGN-RULES.md](DESIGN-RULES.md); its `app-ref/` screenshots weren't copied.

- A box means "click me": static facts use type and colour.
- A Panel is the only bordered container, and Panels are never nested.
- Radius is 2px, with no gradients, glows or emoji.
- Tone colours carry meaning only, and accent is for interactive elements.
- Dense 11/12/14px type, with tabular numbers.

**Interaction cues: see `GRAMMAR.md` (DESIGN.md §6c overrides the mockups).**

## Reference shots (`ref/`)

JPEG q75, full page; desk 1440 wide, phone 390 touch; † = viewport only. Name, then state:

- `plan-6-colonies-desk` + `-phone`: Default, 6 colonies, quick wins
- `plan-2-colonies-desk` + `-phone`: 2 highsec colonies
- `plan-no-colonies-desk` + `-phone`: No colonies, question 2
- `plan-nullsec-buyback-desk` + `-phone`: Nullsec, corp buyback
- `plan-q2-show-me-how-desk` + `-phone`: Question 2, "Show me how" open
- `plan-all-products-desk` + `-phone`: "All products" grid
- `plan-q2-make-p2-desk` + `-phone`: Question 2, Make = Factory goods (P2)
- `plan-explainer-desk` + `-phone`†: 60-second explainer drawer
- `plan-least-hauling-desk` + `-phone`: "Least hauling" preference
- `plan-alternative-open-desk` + `-phone`: A rebuild's "1 alternative" open
- `map-desk-1440`: Default, 6 colonies
- `map-desk-1440-product-drawer`: #1 pick clicked, details drawer
- `map-desk-1920-docked`: 1920 wide, details panel docked
- `map-desk-1280`: 1280 wide
- `map-desk-2-colonies-whatif-lava`: 2 colonies, what-if Lava
- `map-desk-traced-product`: "Best thing to make", Coolant traced
- `map-desk-no-colonies`: No colonies
- `map-desk-6-whatif`: 6 of 6, what-if Ice
- `map-desk-help`: "How to use the map" drawer
- `map-phone`: Phone default
- `map-phone-sheet`†: Phone bottom sheet
- `colonies-6-desk` + `-phone`: Default, 6 colonies
- `colonies-expanded-row-desk` + `-phone`: First row expanded
- `colonies-alts-desk` + `-phone`: Other characters' colonies on
- `colonies-2-desk` + `-phone`: 2 colonies
- `colonies-none-desk` + `-phone`: No colonies
