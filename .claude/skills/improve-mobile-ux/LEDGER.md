# Mobile audit ledger

Reference for the next `/improve-mobile-ux` run. Curated in place — topics, not
runs. No dates, no run metadata. Keep under ~150 lines.

## Surfaces audited

One row per surface, with what the audit concluded. Empty until the first run.

| Surface | Conclusion |
| ------- | ---------- |
| —       | —          |

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

| Issue | Surface | Verdict | Finding |
| ----- | ------- | ------- | ------- |
| —     | —       | —       | —       |

## Killed findings

| Finding | Why |
| ------- | --- |
| —       | —   |
