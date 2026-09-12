/**
 * Regression guard for the rail's one genuinely subtle number.
 *
 * The runway divides the *journal division's own* balance by that division's
 * own spending. Reading `vitals.ts` alone makes the opposite look true —
 * `totalBalance` sums every division, and the journal is loaded for division 1
 * — so a reviewer who never opens this file can conclude the rail puts an
 * all-divisions balance over one division's burn rate and "fix" it. That fix
 * would introduce the bug it claims to remove, which is exactly what
 * `docs/context/decisions/20260903-155950-the-corp-ops-board.md` rejected:
 *
 *   > Every division's balance over one division's outgoings would answer a
 *   > question nobody asked.
 *
 * These tests exist so that change fails loudly instead of shipping.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpVitalsRail } from './CorpVitalsRail';
import type { WalletDivision } from './divisions';
import type { VitalsJournalEntry } from '@/engine/corp/vitals';

const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);
const DAY_MS = 86_400_000;

/**
 * One month's spending out of division 1: 300M over the 30-day window is
 * 10M/day, which makes every runway below a round number.
 */
const JOURNAL: readonly VitalsJournalEntry[] = [{ atMs: NOW - DAY_MS, amount: -300_000_000 }];

/**
 * Division 1 holds 450M — 45 days at 10M/day. Division 3 holds the rest of a
 * 10B total, which at the same burn rate would read as 1,000 days. The two
 * answers cannot be confused for one another, which is the point.
 */
function divisions(masterBalance = 450_000_000): WalletDivision[] {
  return [
    { division: 1, name: 'Master Wallet', balance: masterBalance },
    { division: 3, name: 'Buyback', balance: 10_000_000_000 - masterBalance },
  ];
}

function renderRail(overrides: Partial<Parameters<typeof CorpVitalsRail>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CorpVitalsRail
        divisions={divisions()}
        journal={JOURNAL}
        journalDivision={1}
        nowMs={NOW}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe('CorpVitalsRail runway', () => {
  it('divides the journal division’s own balance by its own spending', () => {
    renderRail();
    expect(screen.getByText('45 days')).toBeInTheDocument();
  });

  it('never divides the all-divisions total by one division’s spending', () => {
    renderRail();
    // 10B / 10M/day. If this ever renders, the rail has been "fixed" into the
    // shape the ops-board scope decision explicitly rejected.
    //
    // No thousands separator: `runwayDays_other` is a plain `{{count}}` and
    // i18n/index.ts sets no `format`, so this renders "1000 days". Asserting
    // "1,000 days" here would be a query that can never match — an assertion
    // that passes just as happily after the bad change as before it.
    expect(screen.queryByText('1000 days')).not.toBeInTheDocument();
  });

  it('still shows the all-divisions sum as the Total chip', () => {
    renderRail();
    // `total` is cosmetic and stays all-divisions — narrowing it to the
    // journal's division would be the opposite over-correction.
    //
    // The chip shows shorthand (issue #947); the exact sum is its accessible
    // name, so assert on that — "10B" alone would still read the same after a
    // 10,004,000,000 regression.
    expect(screen.getByText('10B')).toBeInTheDocument();
    expect(screen.getByLabelText('10,000,000,000.00 ISK')).toBeInTheDocument();
  });

  it('follows the journal division when it is not the master wallet', () => {
    renderRail({
      divisions: [
        { division: 1, name: 'Master Wallet', balance: 9_550_000_000 },
        { division: 3, name: 'Buyback', balance: 450_000_000 },
      ],
      journalDivision: 3,
    });
    expect(screen.getByText('45 days')).toBeInTheDocument();
  });

  it('reports Unknown rather than a figure when the division has no balance', () => {
    renderRail({ divisions: [{ division: 3, name: 'Buyback', balance: 1_000_000 }] });
    // Division 1 is absent from `divisions`, so its balance reads 0 and
    // `runwayDays` refuses to invent a number.
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
