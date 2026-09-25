# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface              | Conclusion                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview (board)     | Fine at 1440. At 1024 the two-card-wide left column wraps card headers unevenly (#1615). Not yet seen populated: e2e mocks render every count 0. |
| Wallet (Balance tab) | Balance readout sits under the chart / empty state (#1616). Journal tab and corp owner view not audited.                                         |
| Assets (root list)   | Total value is 11px text in the list header (#1617). Drill-in, select mode and CSV export not audited; e2e mocks have no assets.                 |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- `BoardCard` footers pin to the card's bottom edge so a row of cards shares one bottom line.
- `NumberTile`: a zero drops tone and link; a count only links when it has a filtered destination.

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own. A new one earns
its place by killing a whole class of finding.

- **A prior ticket that reserved a placement for a human** (e.g. #712 on the Assets total) makes a re-placement finding `ESCALATE`, never `ready-for-agent`.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

- #1615 tweak, NARROW (bug): Overview board card headers wrap and misalign at 1024.
- #1616 tweak, SHIP: Wallet Balance tab leads with ISK, not the chart.
- #1617 tweak, ESCALATE: Assets total value promoted to a StatChip in PageHeader.

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Nothing killed by the hostile reviewer yet. Rendering with the e2e mocks yields empty states only, so populated-state findings must be marked code-read only.
