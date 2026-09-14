# Mobile audit ledger

Reference for the next `/improve-mobile-ux` run. Curated in place — topics, not
runs. No dates, no run metadata. Keep under ~150 lines.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                         | Conclusion                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assets (`src/routes/Assets.tsx`)                | Already heavily reworked for phones (`assetBrowserRows.tsx`'s header comment walks through it): no fixed-width columns, 44-64px row targets, `IskAmount`'s `revealOn` handles the touch reveal correctly. No findings survived. |
| Alerts (`/alerts`, `AlertGroupRow.tsx`)         | Also already reworked deliberately for 390px (`order-*` wrapping, `line-clamp-2` below `sm`, `min-h-11` rows) — comments in `AlertGroupRow.tsx` document the exact reasoning. No findings survived.                             |
| Contracts (`/contracts`, History + Search tabs) | History tab's `DataTable` stacks correctly (no opt-out). Search tab's Courier sub-view (`CourierResults.tsx`) had one real self-alignment bug — filed as #1046. Items sub-view and `FilterBar` usage are clean.                 |

## Contract already enforced

Mobile rules proved by a component or a spec, so no run re-discovers them.

- **Control scale** — `src/components/ui/controlStyles.ts` is the single source
  of the `h-9 md:h-7` / `h-11 md:h-9` tiers, read by `Button`, `IconButton`,
  `FilterChip`, `TextInput`, `SearchInput`, `NativeSelect`, `SelectTrigger`.
- **Table stacking** — `DataTable` defaults to `responsive="stack"`; the four
  `responsive="table"` opt-outs are `ContractDetailModal` (twice), `Wallet`,
  `Characters` and `LoyaltyStore`.
- **Phone navigation** — `src/app/Layout.tsx` ships a `md:hidden` tab bar plus a
  More sheet (`mobileSheetPaths`) carrying every character view the bar cannot
  hold. `docs/UX-REVIEW.md` §8's "six views unreachable on mobile" is fixed.
- **Narrow-viewport specs in CI** — `e2e/charactersToolbarNarrow.spec.ts`,
  `corpBoardNarrow.spec.ts`, `filterSheetNarrow.spec.ts`, all at
  `{ width: 390, height: 844 }`.
- **`SkillCompare`** stacks rather than scrolling sideways (#406) — the
  columns-are-the-content opt-out was reconsidered and rejected there.

## Standing kill-tests

Live in [RUBRIC.md](RUBRIC.md) so the audit and the hostile reviewer read one
copy. Add a new one there only when it kills a class of finding.

## Filed findings

| Issue | Surface                      | Verdict                                    | Finding                                                                                                                                                          |
| ----- | ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1046 | Contracts › Search › Courier | SHIP (narrowed: needs its own Narrow spec) | `CourierResults.tsx`'s `iskPerJump` cell self-aligns (`items-end`) with no `sm:` gate, zigzagging the board's own ranking figure once the row stacks below `sm`. |

## Killed findings

| Finding                                                                                          | Why                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IskAmount`'s `revealOn="longPress"`/`"tap"` hides the exact figure behind a gesture             | By design (`src/components/ui/IskAmount.tsx`): the compact value is always visible, and the exact figure is the element's accessible name, so a screen reader gets it with no gesture at all. Not a violation.                  |
| `title=` on `SecurityValue`/`CharacterBadge` (`assetBrowserRows.tsx`) flagged by the F-axis grep | The value/name is already visible as on-screen text; `title` only adds a longer description for a mouse hover. Not "hover-only information" — the RUBRIC's grep for bare `title=` needs this per-hit check, not a blanket rule. |
| `CourierContractDetailModal.tsx`'s `items-end`/`text-right` reward/ISK-per-jump grid             | A bespoke 2-column modal summary, not a `DataTable` stack — DESIGN.md §4a's self-alignment rule targets `.dt-stack` cells specifically and doesn't reach a hand-built modal layout.                                             |
| Assets root header's Sort/Route `Select` pair wrapping at 390px                                  | Already fixed by issue #415 (`flex-wrap` + explicit `order`, per the inline comment) — not a fresh finding.                                                                                                                     |
