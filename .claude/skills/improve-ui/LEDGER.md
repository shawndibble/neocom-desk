# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                                 | Conclusion                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview (board + Alerts column)                        | Clean at 1280+. At 1024-1179 the cards/alerts split starts at `lg` (viewport) not at content width, so card titles and badges truncate (#1615 made them truncate, not wrap). Filed #1680.                                                                |
| Industry (Build Plans tab, Active Jobs strip)           | Empty-state layout clean. Active Jobs free-slot readout printed bare "1 / 1 / 1" with colour-only tone: #1681. Populated Records/Opportunities/BPC Search tabs not rendered (mocks give no data; `?tab=` is not the tab switch): audit with seeded data. |
| Skills > Trained                                        | Clean at both widths, empty and loading. "N of 5 slots empty" counts attribute enhancers only. Expanded skill rows not rendered.                                                                                                                         |
| Wallet (Balance, Journal)                               | Clean at 1024 and 1440: `EmptyState`s explain the fix, Balance leads with ISK, Journal amounts right-aligned. Balance chart X axis was categorical: #1916.                                                                                               |
| Assets (seeded one location)                            | Clean. The tall single-location panel is a scroll container, not a dead zone.                                                                                                                                                                            |
| Market > Open Orders (seeded 2 orders)                  | Untitled `Panel` header bar carries only actions because the tab names it. Not a finding.                                                                                                                                                                |
| Characters (card view)                                  | Card header never wraps (`flex-1 min-w-0`), so at 1024's three columns the active card's name collapses: #1943. Toolbar and 1440 clean.                                                                                                                  |
| Market Browser (empty pre-selection)                    | Clean. Tree plus empty detail pane leaves a void at 1440; that is the empty state. A selected item's order book not rendered.                                                                                                                            |
| Fittings (open Fitting, Compare)                        | Header buttons stack, Compare controls and columns, Ring column: #1925-#1929.                                                                                                                                                                            |
| Contracts > History (seeded 7 contracts, both widths)   | No date for when a contract was issued; only Expires, and default sort is a proxy: #1954. Issuer cell and PRICE / REWARD header wrap at 1024 (not filed; revisit if #1954 makes it worse). Search tab needs the sync backend; empty state explains.      |
| Planetary Industry > Colonies (4 seeded colonies), Plan | Colony rows misalign bars and wrap at 1024-1180: #1952. Plan tab renders clean (inputs column tall but dense). Empty states are bare titles after a successful fetch, by design (`CachedEmptyState`).                                                    |
| Contacts (12 seeded), Loyalty Store (14 offers), Clones | Contacts: header info icon drifts from its label (shared `DataTable`): #1953. Loyalty Store: narrow list plus empty detail pane is the unselected state; clean. Clones empty state clean.                                                                |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- **Page width tiers are deliberate.** Most routes are `max-w-6xl`; the three Industry routes are `max-w-7xl` (#534). Decision: `docs/context/decisions/20260901-172427-app-wide-page-width.md`. A 25px left-edge shift between Industry and Skills at 1440 is that tiering, not a bug.
- **Narrow pointer layout.** #1615 keeps Overview card headers on one line at 1024 (truncate, never wrap); #1638 keeps Calendar's Coming Up rail at least 18rem (`calendarPointerWidths.spec.ts`).

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own. A new one earns
its place by killing a whole class of finding.

- **Fix the mechanism, not the breakpoint.** When a card clips at one width, look for the flex rule that stops wrapping (`flex-1 min-w-0` beside a `flex-wrap`) before proposing a column-count change.
- **A collapsed disclosure's header is decided.** A decision file that starts a group collapsed also settles what its header carries; a finding that adds state there needs a cost Plans, Overview or a row chip (#1724) do not already answer.
- **Search closed issues first.** Wallet, Market, Assets and Overview have been swept repeatedly (#1615, #1616, #1699, #1700, #1721, #1738); most feature gaps already shipped. The e2e mock returns near-empty data, so seed routes (journal, orders, assets, planets, contracts, contacts) to judge populated states.
- **Measure at 1024, 1180 and 1280.** Sidebar (191px) plus padding takes ~240px, so `lg:`/`md:` breakpoints keyed to the viewport give columns far narrower than the viewport suggests. Test `scrollWidth > clientWidth` and row heights at 1024, 1180, 1280. Row wraps often appear at 1180 while 1280 is clean.
- **Mock artefacts are not findings.** "Unknown 9100000", "Type #2073", a "Sync error" banner and blank statuses come from unmocked name lookups or invalid ESI enum values in a seed. Use real ESI enums and mock `/universe/names`, `/universe/systems` before judging a label.
- **Screenshots land in `C:\tmp`.** Playwright's `/tmp/x` writes to `C:\tmp\x`, while Git Bash's `/tmp` is a different directory; look in `/c/tmp`.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

| Issue | Size  | Verdict | Finding                                                                           |
| ----- | ----- | ------- | --------------------------------------------------------------------------------- |
| #1680 | tweak | NARROW  | Overview: move the cards/alerts split from `lg` to `xl` so cards stop clipping.   |
| #1681 | tweak | SHIP    | Industry Active Jobs: label each free-slot figure Mfg/Sci/Rxn from `md` up.       |
| #1916 | tweak | NARROW  | Wallet Balance chart: time-scaled X axis, unique day-aligned ticks.               |
| #1925 | tweak | SHIP    | 1024 open-Fitting header buttons stack one per line.                              |
| #1926 | tweak | NARROW  | Start preview "Empty in 0m" (preview-only; do not touch shared `formatDuration`). |
| #1927 | tweak | NARROW  | Compare controls into one wrapping row.                                           |
| #1928 | tweak | SHIP    | Compare Stats/Modules fit columns share widths.                                   |
| #1929 | tweak | NARROW  | Ring column sticky at lg+.                                                        |
| #1943 | tweak | NARROW  | Characters card name collapses at 1024; identity block gets a width floor.        |
| #1952 | tweak | NARROW  | PI Colonies rows: shared column tracks so bars align and rows never wrap at md+.  |
| #1953 | tweak | SHIP    | DataTable header info icon hugs its label on left/center-aligned columns.         |
| #1954 | tweak | NARROW  | Contracts History: Issued column, default sort issued desc.                       |

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Stats panel preamble reflow (weather + toolbar to one row, Manage buttons inline): stats column is 22rem at lg so inline Manage only fits at xl; rest is rearrangement with no user cost.
- Industry vs other routes' content width differing at 1440: documented tiering (see Contract).
- Overview Alerts card showing a tall empty area beside two short card rows when there are no alerts: empty-state artefact of grid `stretch`, which the code comment defends on purpose.
- Wallet journal lacks a net total: shipped in #1721.
- Open Orders panel has an untitled header bar: the tab already names it.
- Skills Trained: mark the group holding the in-progress skill on its collapsed header. Groups start collapsed by decision (`20260901-092551-skills-pages-rework`), #1724 chips the row, Plans and Overview show the queue.
- PI Colonies empty state is a bare "No planetary colonies" with no link to the Plan tab: bare fetched-and-empty titles are `CachedEmptyState`'s contract, and the Advisor tab already points at Plan. Cost too small.
- PI Colonies repeated per-row "STATUS" label: a scan aid; removing it is a design call, not a defect.
- Contracts History "expired" status renders blank: `expired` is not an ESI contract status, a seed artefact.
- Loyalty Store "Type #43" names and Contacts "Unknown N" names: unmocked name lookups.
