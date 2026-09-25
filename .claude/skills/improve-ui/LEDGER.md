# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                                    | Conclusion                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview (`/overview`, board + Alerts column)              | Clean at 1280+. At 1024-1179 the cards                                                                                                                                                                                                                                                           | alerts split starts at `lg` (viewport) not at the content width, so cards are ~250px and titles, "Not urgent" badges and the "Undercut" tile label truncate (#1615 made them truncate rather than wrap) — filed #1680. |
| Industry (`/industry`, Build Plans tab, Active Jobs strip) | Empty-state layout is clean. `ActiveJobsPanel`'s free-slot readout prints bare "1 / 1 / 1" with colour-only tone — filed #1681. Populated Records/Opportunities/BPC Search tabs were not rendered (mocks give no data; `?tab=` query is not the tab switch) — audit those with seeded data next. |
| Skills › Trained (`/skills/trained`)                       | Empty/loading render is clean (chips show "—" then fill; Attributes panel, search + expand/collapse row, collapsed groups). Expanded skill rows not rendered.                                                                                                                                    |
| Wallet (`/wallet`, Balance tab, empty state)               | Clean at 1024 and 1440 in the empty state: `EmptyState`s explain the fix, Balance leads with the ISK figure. Journal tab not rendered.                                                                                                                                                           |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- **Page width tiers are deliberate.** Most routes are `max-w-6xl`; the three Industry routes are `max-w-7xl` (Industry's hero/side-by-side ledger rework, #534). Decision: `docs/context/decisions/20260901-172427-app-wide-page-width.md`. A 25px left-edge shift between Industry and Skills at 1440 is that tiering, not a bug.
- **Narrow pointer layout.** #1615 keeps Overview card headers on one line at 1024 (truncate, never wrap); #1638 keeps Calendar's Coming Up rail at least 18rem (`calendarPointerWidths.spec.ts`).

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own. A new one earns
its place by killing a whole class of finding.

- **Measure at 1024 _and_ 1180.** Sidebar (191px) plus padding takes ~240px, so `lg:`/`md:` breakpoints keyed to the viewport give columns far narrower than the viewport suggests. Test `scrollWidth > clientWidth` on leaf elements in `main` at 1024, 1180, 1280.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

| Issue | Size  | Verdict | Finding                                                                     |
| ----- | ----- | ------- | --------------------------------------------------------------------------- |
| #1680 | tweak | NARROW  | Overview: move the cards                                                    | alerts split from `lg` to `xl` so cards stop truncating at 1024-1279. |
| #1681 | tweak | SHIP    | Industry Active Jobs: label each free-slot figure Mfg/Sci/Rxn from `md` up. |

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Industry vs other routes' content width differing at 1440 — documented tiering (see Contract).
- Overview Alerts card showing a tall empty area beside two short card rows when there are no alerts — empty-state artefact of grid `stretch`, which the code comment defends on purpose.
