# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                                               | Conclusion                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview (`/overview`, board + Alerts column)                         | Clean at 1280+. At 1024-1179 the cards                                                                                                                                                                                                                                                           | alerts split starts at `lg` (viewport) not at the content width, so cards are ~250px and titles, "Not urgent" badges and the "Undercut" tile label truncate (#1615 made them truncate rather than wrap) — filed #1680. |
| Industry (`/industry`, Build Plans tab, Active Jobs strip)            | Empty-state layout is clean. `ActiveJobsPanel`'s free-slot readout prints bare "1 / 1 / 1" with colour-only tone — filed #1681. Populated Records/Opportunities/BPC Search tabs were not rendered (mocks give no data; `?tab=` query is not the tab switch) — audit those with seeded data next. |
| Skills › Trained (`/skills/trained`)                                  | Empty/loading render is clean (chips show "—" then fill; Attributes panel, search + expand/collapse row, collapsed groups). Expanded skill rows not rendered.                                                                                                                                    |
| Wallet (`/wallet`, Balance tab, empty state)                          | Clean at 1024 and 1440 in the empty state: `EmptyState`s explain the fix, Balance leads with the ISK figure. Journal tab: see the seeded row below.                                                                                                                                              |
| Wallet � Balance chart + Journal (seeded 25 rows)                     | Journal table clean (amount header/cells right-aligned; net total shipped in #1721). Balance chart X axis is categorical, so date labels repeat and entries are spaced by index, not time: filed #1916.                                                                                          |
| Assets (`/assets`, seeded one location)                               | Clean at both widths; the tall single-location panel is a scroll container, not a dead zone.                                                                                                                                                                                                     |
| Market � Open Orders (seeded 2 healthy orders)                        | Untitled `Panel` header bar carries only actions because the tab already names it. Not a finding.                                                                                                                                                                                                |
| Characters (`/characters`, card view)                                 | Card header row never wraps (identity `flex-1 min-w-0`), so at 1024's three columns the active card's name collapses. Filed #1943. Toolbar and 1440 layout clean.                                                                                                                                |
| Skills Trained (second pass)                                          | Clean at both widths. "N of 5 slots empty" counts attribute enhancers only, so it can sit beside other implants. Expanded rows not rendered.                                                                                                                                                     |
| Market Browser (`/market?section=browser`, empty pre-selection state) | Clean. Tree plus empty detail pane leaves a void at 1440; that is the empty state. A selected item's order book was not rendered.                                                                                                                                                                |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- **Page width tiers are deliberate.** Most routes are `max-w-6xl`; the three Industry routes are `max-w-7xl` (Industry's hero/side-by-side ledger rework, #534). Decision: `docs/context/decisions/20260901-172427-app-wide-page-width.md`. A 25px left-edge shift between Industry and Skills at 1440 is that tiering, not a bug.
- **Narrow pointer layout.** #1615 keeps Overview card headers on one line at 1024 (truncate, never wrap); #1638 keeps Calendar's Coming Up rail at least 18rem (`calendarPointerWidths.spec.ts`).

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own. A new one earns
its place by killing a whole class of finding.

- **Fix the mechanism, not the breakpoint.** When a card clips at one width, look for the flex rule that stops wrapping (`flex-1 min-w-0` beside a `flex-wrap`) before proposing a column-count change.
- **A collapsed disclosure's header is decided.** A decision file that starts a group collapsed also settles what its header carries; a finding that adds state there needs a cost Plans, Overview or a row chip (#1724) do not already answer.
- **Search closed issues first.** Wallet, Market, Assets and Overview have been swept repeatedly (#1615, #1616, #1699, #1700, #1721, #1738); most feature gaps already shipped. The e2e mock returns near-empty data, so seed routes (journal, orders, assets) to judge populated states.
- **Measure at 1024 _and_ 1180.** Sidebar (191px) plus padding takes ~240px, so `lg:`/`md:` breakpoints keyed to the viewport give columns far narrower than the viewport suggests. Test `scrollWidth > clientWidth` on leaf elements in `main` at 1024, 1180, 1280.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

- #1925 tweak SHIP: 1024 open-Fitting header buttons stack one per line.
- #1926 tweak NARROW: Start preview "Empty in 0m" (preview-only branch; do not touch shared `formatDuration`).
- #1927 tweak NARROW: Compare controls into one wrapping row.
- #1928 tweak SHIP: Compare Stats/Modules fit columns share widths.
- #1929 tweak NARROW: Ring column sticky at lg+.
- #1943 bug/tweak NARROW: Characters card name collapses at 1024; give the identity block a width floor so the controls wrap.

| Issue | Size  | Verdict | Finding                                                                           |
| ----- | ----- | ------- | --------------------------------------------------------------------------------- |
| #1680 | tweak | NARROW  | Overview: move the cards                                                          | alerts split from `lg` to `xl` so cards stop truncating at 1024-1279. |
| #1681 | tweak | SHIP    | Industry Active Jobs: label each free-slot figure Mfg/Sci/Rxn from `md` up.       |
| #1916 | tweak | NARROW  | Wallet Balance chart: time-scaled X axis, unique day-aligned ticks (pure helper). |

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Stats panel preamble reflow (weather + toolbar to one row, Manage buttons inline): stats column is 22rem at lg so inline Manage only fits at xl; rest is rearrangement with no user cost.

- Industry vs other routes' content width differing at 1440 — documented tiering (see Contract).
- Overview Alerts card showing a tall empty area beside two short card rows when there are no alerts — empty-state artefact of grid `stretch`, which the code comment defends on purpose.
- Wallet journal lacks a net total � shipped in #1721.
- Open Orders panel has an untitled header bar � the tab already names it.
- Skills Trained: mark the group holding the in-progress skill on its collapsed header. Groups start collapsed by decision (`20260901-092551-skills-pages-rework`), #1724 chips the row, Plans and Overview show the queue.
