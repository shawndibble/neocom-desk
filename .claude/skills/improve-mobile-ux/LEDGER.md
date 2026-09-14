# Mobile audit ledger

Reference for the next `/improve-mobile-ux` run. Curated in place — topics, not
runs. No dates, no run metadata. Keep under ~150 lines.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                                                                                       | Conclusion                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assets (`src/routes/Assets.tsx`)                                                                              | Already heavily reworked for phones (`assetBrowserRows.tsx`'s header comment walks through it): no fixed-width columns, 44-64px row targets, `IskAmount`'s `revealOn` handles the touch reveal correctly. No findings survived.                                                                 |
| Alerts (`/alerts`, `AlertGroupRow.tsx`)                                                                       | Also already reworked deliberately for 390px (`order-*` wrapping, `line-clamp-2` below `sm`, `min-h-11` rows) — comments in `AlertGroupRow.tsx` document the exact reasoning. No findings survived.                                                                                             |
| Contracts (`/contracts`, History + Search tabs)                                                               | History tab's `DataTable` stacks correctly (no opt-out). Search tab's Courier sub-view (`CourierResults.tsx`) had one real self-alignment bug — filed as #1046. Items sub-view and `FilterBar` usage are clean.                                                                                 |
| Wallet (`/wallet`, personal + corp)                                                                           | Clean throughout: journal/transactions tables use `DataTable` default stacking correctly, `FilterBar` used correctly on both journal and corp-transactions filter rows, no self-aligned cells, no hand-written control heights. No findings survived.                                           |
| Industry (`/industry`, Records + Opportunities tabs)                                                          | `ProductionLogPanel`/`ProductionRunsPanel`'s shared "Sold" action column self-aligns unguarded — filed as #1053. `OpportunitiesPanel`'s margin column was a similar bug already fixed (#762, closed). BPC Sourcing, list/detail pane scroll behavior clean.                                     |
| Industry (`ActiveJobsPanel`, Build Plans tab chrome)                                                          | Clean: touch targets all go through `Button`/`IconButton`, the progress bar's percent text is correctly held behind `sm:text-right`, and the job-slot summary's explain-only tooltip needs no `openOnTap` since touch-and-hold already reveals it regardless of the prop. No findings survived. |
| Mail (`/mail`)                                                                                                | Two-pane→single-pane collapse, folder toggle chips and two-line rows are all correctly built for 390px per extensive prior decisions. One real bug: reading-pane body scroller can hide content behind the fixed tab bar — filed as #1054.                                                      |
| Mining Tax (`/moon-mining`, Tax + Overview tabs)                                                              | Heavily hand-iterated at 390px already (balances-strip decision doc records a real mobile review). One touch-target gap on the Balances strip's Payee-name button — filed as #1055 (narrowed by hostile review).                                                                                |
| Market (`/market?section=orders`, Open Orders worklist)                                                       | Filter row, `DataTable` stacking and self-alignment are all clean. One real bug: each problem group's expand/collapse header, and the Healthy group's inline show/hide link beside it, are bare `<button>`s with no touch-target sizing (~32px and ~16-18px respectively) — filed as #1064.     |
| Overview (`/overview`, the default landing route)                                                             | Extensively phone-tuned already (`PHONE_FULL_COUNT` card folding, an "Everything else" tail row, a dedicated mockup) — see `Overview.tsx`'s and `cards.tsx`'s header comments. One real bug: every board card's "Open" header link is a bare, unsized `<Link>` — filed as #1070.                |
| Skills (`/skills/trained`)                                                                                    | Attributes/implants panel, search+expand/collapse toolbar and per-skill SP figures are clean. One real bug: the per-group disclosure header hand-rolls the same undersized `min-h-8` pattern `Disclosure.tsx` itself ships — filed as #1071 (narrowed; individual skill rows killed on review). |
| Corp (`/corp`, Board/Overview: Standing, Kind Cards, Deadline Strip, Offline Services, Vitals + People rails) | Heavily reworked already (#419, #566 — exact 390px/320px measurements documented inline, `corpBoardNarrow.spec.ts` guards the 320px case). No findings survived.                                                                                                                                |

## Contract already enforced

Mobile rules proved by a component or a spec, so no run re-discovers them.

- **Control scale** — `src/components/ui/controlStyles.ts` is the single source
  of the `h-9 md:h-7` / `h-11 md:h-9` tiers, read by `Button`, `IconButton`,
  `FilterChip`, `TextInput`, `SearchInput`, `NativeSelect`, `SelectTrigger`.
  Only the `md` tier (`h-11 md:h-9`) reaches the real 44px touch floor — the
  `sm` tier (`h-9 md:h-7`) tops out at 36px on touch, so a fix that reaches
  for `sm` to "hit 44px" doesn't (caught filing #1055).
- **Table stacking** — `DataTable` defaults to `responsive="stack"`; the four
  `responsive="table"` opt-outs are `ContractDetailModal` (twice), `Wallet`,
  `Characters` and `LoyaltyStore`.
- **Phone navigation** — `src/app/Layout.tsx` ships a `md:hidden` tab bar plus a
  More sheet (`mobileSheetPaths`) carrying every character view the bar cannot
  hold. `docs/UX-REVIEW.md` §8's "six views unreachable on mobile" is fixed.
- **Narrow-viewport specs in CI** — `e2e/charactersToolbarNarrow.spec.ts`,
  `corpBoardNarrow.spec.ts`, `filterSheetNarrow.spec.ts`, all at
  `{ width: 390, height: 844 }`. Industry, Mail, Mining Tax, Market's Open
  Orders, Overview and Skills still have none — the tickets filed each round
  each add one (#1053/#1054/#1055/#1064/#1070/#1071).
- **`SkillCompare`** stacks rather than scrolling sideways (#406) — the
  columns-are-the-content opt-out was reconsidered and rejected there.
- **`useViewportBoundedHeight`'s fixed-tab-bar gap** — the hook
  (`src/lib/useViewportBoundedHeight.ts`) sizes purely off raw
  `window.innerHeight`, unaware of `Layout.tsx`'s fixed `md:hidden` mobile tab
  bar. `PlanEditor.tsx` already gates its call behind `isDesktop` so phone
  falls back to normal document flow (safe, since `Layout.tsx`'s `<main>`
  already pads for the tab bar in flow) — the correct pattern for any other
  consumer. Mail's own call was unguarded (filed #1054); `PlanListPane.tsx`
  and `NotificationsPanel.tsx` were not checked this round and may have the
  same gap — worth a quick look on a future SkillPlans/Notifications pass.
- **Bare-button disclosure rows under the touch tier** — `#1064`'s fix is
  scoped to `OpenOrdersPanel`. `src/components/ui/Disclosure.tsx` itself ships
  `min-h-8` (32px, under even the pointer floor) and Skills' per-group header
  hand-rolls the same pattern rather than using it — filed as #1071, which
  also fixes `Disclosure.tsx` itself. The Market-Group-tree headers share the
  same gap and are still unfiled — worth a dedicated pass on a future run.

## Standing kill-tests

Live in [RUBRIC.md](RUBRIC.md) so the audit and the hostile reviewer read one
copy. Add a new one there only when it kills a class of finding.

## Filed findings

| Issue | Surface                              | Verdict                                    | Finding                                                                                                                                                                             |
| ----- | ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1046 | Contracts › Search › Courier         | SHIP (narrowed: needs its own Narrow spec) | `CourierResults.tsx`'s `iskPerJump` cell self-aligns (`items-end`) with no `sm:` gate, zigzagging the board's own ranking figure once the row stacks below `sm`.                    |
| #1053 | Industry › Records / Production Runs | SHIP                                       | `SoldSplitButton`'s button group (`SaleLinkingControls.tsx`) self-aligns (`justify-end`) with no `sm:` gate, so the Sold/Watch/Manual/Delete actions zigzag off every stacked card. |
| #1054 | Mail › reading pane                  | SHIP                                       | The reading pane's body scroller (`useViewportBoundedHeight`) applies its max-height unconditionally, so a long mail's tail can be hidden behind the fixed mobile tab bar.          |
| #1055 | Mining Tax › Balances strip          | NARROW (hit-area only, not the `sm` tier)  | The per-Payee filter button in each balance card carries no touch-target sizing at all — ~20px hit area on the app's only "check who I owe" drill-in control.                       |
| #1064 | Market › Orders (`OpenOrdersPanel`)  | SHIP                                       | Each problem group's expand/collapse header and the Healthy group's inline show/hide link are bare `<button>`s with no touch-target sizing — the panel's most-repeated interaction. |
| #1070 | Overview › board cards               | SHIP                                       | `BoardCard`'s "Open" header link is a bare, unsized `<Link>` (~16-17px hit height) — the sole full-page affordance on two of the four cards, on the app's default landing route.    |
| #1071 | Skills › trained-list group headers  | NARROW (group header only, skill row cut)  | The per-group disclosure header hand-rolls `Disclosure.tsx`'s own undersized `min-h-8`; fix reaches the shared component too, not just this page.                                   |

## Killed findings

| Finding                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IskAmount`'s `revealOn="longPress"`/`"tap"` hides the exact figure behind a gesture                                                           | By design (`src/components/ui/IskAmount.tsx`): the compact value is always visible, and the exact figure is the element's accessible name, so a screen reader gets it with no gesture at all. Not a violation.                                                                                                                                                                       |
| `title=` on `SecurityValue`/`CharacterBadge` (`assetBrowserRows.tsx`) flagged by the F-axis grep                                               | The value/name is already visible as on-screen text; `title` only adds a longer description for a mouse hover. Not "hover-only information" — the RUBRIC's grep for bare `title=` needs this per-hit check, not a blanket rule.                                                                                                                                                      |
| `CourierContractDetailModal.tsx`'s `items-end`/`text-right` reward/ISK-per-jump grid                                                           | A bespoke 2-column modal summary, not a `DataTable` stack — DESIGN.md §4a's self-alignment rule targets `.dt-stack` cells specifically and doesn't reach a hand-built modal layout.                                                                                                                                                                                                  |
| Assets root header's Sort/Route `Select` pair wrapping at 390px                                                                                | Already fixed by issue #415 (`flex-wrap` + explicit `order`, per the inline comment) — not a fresh finding.                                                                                                                                                                                                                                                                          |
| `OpportunitiesPanel`'s 8-column ranked table producing a long stacked card, "too dense to scan"                                                | Self-killed before hostile review: the candidate cited a "`BuildPlanList` already hides Verdict/Runs below `sm`" precedent that does not exist anywhere in the codebase (`hidden sm:table-cell`/`hidden md:table-cell` greps for zero hits), and without a real precedent it's indistinguishable from the "fewer columns for breathing room" kill-test.                              |
| `ActiveJobsPanel`'s job-slot summary `Tooltip` has no `openOnTap`                                                                              | Self-killed: `Tooltip.tsx`'s touch-and-hold reveal fires unconditionally, `openOnTap` only swaps it for a plain tap — so an explain-only trigger without it is still touch-reachable, just via long-press. Not "hover-only information."                                                                                                                                             |
| Skills trained-list: individual skill row (`py-1.5`, no `min-h`) is a touch-target gap too                                                     | Narrowed out of #1071 by hostile review: measured height (~28-30px) sits between the WCAG 24px floor and the 44px touch tier, not under both as first estimated, and tapping into a skill's prereq/unlock inspector reads as a planning workflow rather than a phone glance — the group header survives the same test because it gates seeing the list at all.                       |
| Corp ops board (`/corp`) — re-audited whole surface: Standing figures, Kind Cards, Deadline Strip, Offline Services chips, Vitals/People rails | No bare buttons, no self-aligned `DataTable` cells (none of this surface uses `DataTable`), no hover-only info, no fixed-width overflow beyond what `corpBoardNarrow.spec.ts` already guards at 320px. #419/#566's inline comments already document exact 390px/576px measurements for the pieces that needed them (Standing's figure wrap, the Deadline Strip's 7-day phone slice). |
