# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                      | Conclusion                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Industry (index tabs)                        | Build Plans list hand-rolls its heading in the panel body (filed). Active Jobs bar, Records, Opportunities follow the Panel contract. Free-slots triad and 7xl width are deliberate (see Killed). Populated states are not renderable from the mocks.                                                                                                                   |
| Skills (Plans, Trained)                      | Skill Plans list hand-rolls its heading beside a Panel-header Attributes pane (filed). Trained tab is clean.                                                                                                                                                                                                                                                            |
| Market (Market, Open, Appraisal)             | Empty-state renders read fine at 1440 and 1024. Item-selected and History renders failed (ESI orders route unmocked), so the order-book panel is unaudited.                                                                                                                                                                                                             |
| Overview, Assets                             | Already ticketed by earlier runs (#1615, #1617); not re-audited.                                                                                                                                                                                                                                                                                                        |
| Wallet (Balance, Journal)                    | Only empty states render from the mocks. Balance leads with the ISK figure (#1616 landed); code read found no layout finding. Journal rows, chart and multi-character table unaudited by eye.                                                                                                                                                                           |
| Planetary Industry (Plan, Advisor, Colonies) | Plan tab and Advisor render fully (Advisor needs the `e2e/piAdvisor.spec.ts` colony fixture; Colonies too). Advisor colony strip loses its name at 1024 (filed #1649). Plan chain table's Make or buy cell is doubled and wraps at 1024, and the sensitivity table's "Needs a rate" reads as a customs rate (filed #1650). Colonies list and Advisor at 1440 are clean. |
| Alerts                                       | Empty state only. Code read: filter bar, grouped rows, per-row links and focus handling follow the contract. No finding.                                                                                                                                                                                                                                                |
| Contracts (History)                          | Status accent tone and a courier reward under a "Price" header filed (#1639). Optional Reward/Collateral/Buyout/Volume columns were cut as over-scoped. Search tab still only reachable as "isn't available" offline.                                                                                                                                                   |
| Calendar                                     | Map is fixed 38rem, so the Coming Up rail is squeezed at 1024 (filed #1638). Populated 1440 render is clean.                                                                                                                                                                                                                                                            |
| Characters                                   | Card and table views read fine. The Density select is the app-wide text size by design (see Killed).                                                                                                                                                                                                                                                                    |
| Fittings (Start screen)                      | Hull picker overflows sideways, hiding 8 of 11 classes (filed #1637). Load, My Fittings and In-game panels are fine. Editor not audited.                                                                                                                                                                                                                                |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- `Panel`'s header (panel-2 fill, hairline, `min-h-9` at `md`) is the shared toolbar. A panel given `title` or `actions` gets it for free.
- Page width tiers are per-route `mx-auto max-w-*` (decision: app-wide page width). Most routes are `max-w-6xl`; Industry's three routes are `max-w-7xl`.

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own.

- **Height-capped multicol.** `columns-*` inside a `max-h` box spills columns sideways. Measure `scrollWidth` versus `clientWidth` on any such list; it is a probe the render alone will not show.

- **Comment-documented design.** A header comment stating why a control looks the way it does (tone per category, tooltip breakdown, placement in `actions`) makes it deliberate. Ask for a real cost the comment did not weigh, not a redesign.
- **Width drift between route families.** A few px shift in the content column between routes is cosmetic; the wide-table routes were widened on purpose.
- **Mock-limited surfaces.** If the populated state cannot be rendered offline, mark the finding `code-read only` or leave the panel unaudited; do not file from an empty state alone.
- **Fixture reuse beats "unrenderable".** A populated state that the shared mocks lack is often already seeded by an existing spec (`e2e/piAdvisor.spec.ts` colonies). Copy that spec's `beforeEach`, replace its tests with screenshots, and measure with `page.evaluate`. It found a 0px name cell that an empty-state render could not.
- **Reviewer premises need a render check.** A "the panel already explains it" kill is only true if that panel renders in the state the finding shows. Check the conditional before accepting it.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

- #1625 tweak SHIP: Skill Plans and Build Plans panels draw their heading in the body, not Panel's header bar.
- #1637 tweak SHIP (bug): Fittings hull picker height-capped multicol overflows sideways.
- #1638 tweak NARROW (bug): Calendar map fixed 38rem squeezes the Coming Up rail at 1024.
- #1639 tweak SHIP: Contracts History Outstanding status uses the accent tone; Price column also holds a courier reward.
- #1649 tweak SHIP (bug): PI Advisor "Your colonies" strip name cell collapses to 0px at 1024.
- #1650 tweak NARROW: PI Plan chain table Make or buy cell holds two verdicts and wraps at 1024; sensitivity "Needs a rate" renamed (rode along after a KILL was overruled).

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Industry "Free slots 1 / 1 / 1" unlabeled categories: the label is visible from `sm` up, the tooltip carries the breakdown, and a header comment documents the per-category tone and far-right placement (#679). KILL.
- Industry `max-w-7xl` versus `max-w-6xl` elsewhere: the Industry tables were widened deliberately; a 25px shift on navigation is cosmetic and unprovable beyond restating a constant. KILL.
- Characters "Density" select relabels the shared app-wide text size (`useFontScale`); a header comment documents it as deliberate. KILL.
- Contracts History optional Reward/Collateral/Buyout/Volume columns: four columns plus i18n and specs is more than a tweak, the detail modal and Contract Search already carry the fields, and "rows read identically" was speculative. KILL.
- PI Plan Verdict panel lists Margin per unit / per day last: it is a receipt read top to bottom with the two margins emphasised, and moving them would break the arithmetic order. KILL (own review).
- Wallet Journal filtered-range net total: a missing feature, not a hierarchy or alignment problem; belongs to /add-missing-features. KILL.
