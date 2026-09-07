import { describe, it, expect } from 'vitest';
import {
  VITALS_WINDOW_DAYS,
  dailyOutgoings,
  netOverWindow,
  runwayDays,
  totalBalance,
  vitalsFigures,
  type VitalsJournalEntry,
} from './vitals';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => NOW - days * DAY;

const entry = (days: number, amount: number): VitalsJournalEntry => ({
  atMs: daysAgo(days),
  amount,
});

describe('totalBalance', () => {
  it('sums every division the character can see', () => {
    expect(totalBalance([{ balance: 1_000 }, { balance: 250.5 }])).toBe(1_250.5);
  });

  it('is zero for a corporation with no divisions readable', () => {
    expect(totalBalance([])).toBe(0);
  });
});

describe('netOverWindow', () => {
  it('nets income against spending inside the window', () => {
    expect(netOverWindow([entry(1, 500), entry(2, -200)], NOW)).toBe(300);
  });

  it('ignores entries older than the window, so the figure means what it says', () => {
    expect(netOverWindow([entry(1, 100), entry(VITALS_WINDOW_DAYS + 1, 1_000_000)], NOW)).toBe(100);
  });

  it('ignores entries dated in the future rather than letting them skew the net', () => {
    expect(netOverWindow([entry(1, 100), entry(-5, 999)], NOW)).toBe(100);
  });

  it('is zero for an empty journal', () => {
    expect(netOverWindow([], NOW)).toBe(0);
  });
});

describe('dailyOutgoings', () => {
  /**
   * Spending only — the rail's runway asks how long the balance lasts, and
   * income is exactly what a runway must not assume will keep arriving.
   */
  it('averages spending per day, ignoring income entirely', () => {
    const entries = [entry(1, -30 * VITALS_WINDOW_DAYS), entry(2, 1_000_000)];
    expect(dailyOutgoings(entries, NOW)).toBe(30);
  });

  it('reports a positive rate for spending, not a negative one', () => {
    expect(dailyOutgoings([entry(1, -VITALS_WINDOW_DAYS)], NOW)).toBeGreaterThan(0);
  });

  it('is zero for a corporation that spent nothing', () => {
    expect(dailyOutgoings([entry(1, 5_000)], NOW)).toBe(0);
    expect(dailyOutgoings([], NOW)).toBe(0);
  });

  it('ignores spending older than the window', () => {
    expect(dailyOutgoings([entry(VITALS_WINDOW_DAYS + 10, -1_000_000)], NOW)).toBe(0);
  });
});

describe('runwayDays', () => {
  it('divides the balance by what the corporation spends per day', () => {
    expect(runwayDays(1_000, 100)).toBe(10);
  });

  /**
   * A corporation that has spent nothing has no burn rate to divide by, and
   * "infinite days of runway" would be a claim the journal does not support.
   * `null` is the rail's cue to say so rather than print a number.
   */
  it('has no answer when nothing is being spent', () => {
    expect(runwayDays(1_000, 0)).toBeNull();
  });

  it('has no answer for an empty or overdrawn balance rather than a negative runway', () => {
    expect(runwayDays(0, 100)).toBeNull();
    expect(runwayDays(-500, 100)).toBeNull();
  });
});

describe('vitalsFigures', () => {
  const FIG_NOW = Date.UTC(2026, 8, 7, 12);
  const FIG_DAY = 86_400_000;

  it('composes the total, the net and the runway from one reading', () => {
    const figures = vitalsFigures(
      [
        { division: 1, balance: 1_000_000 },
        { division: 2, balance: 500_000 },
      ],
      [
        { atMs: FIG_NOW - FIG_DAY, amount: -30_000 },
        { atMs: FIG_NOW - 2 * FIG_DAY, amount: 10_000 },
      ],
      1,
      FIG_NOW
    );

    expect(figures.total).toBe(1_500_000);
    expect(figures.net).toBe(-20_000);
    // Division 1's own balance over division 1's own spending: 30,000 over 30
    // days is 1,000/day, and 1,000,000 at that rate is 1,000 days.
    expect(figures.runwayDays).toBeCloseTo(1000, 6);
  });

  /**
   * The whole reason this composition is one function: the runway must divide a
   * division's balance by *its own* spending, never by the corporation's total.
   */
  it('takes the runway balance from the journal division, not from the total', () => {
    const journal = [{ atMs: FIG_NOW - FIG_DAY, amount: -30_000 }];

    const fromDivisionOne = vitalsFigures(
      [
        { division: 1, balance: 1_000_000 },
        { division: 3, balance: 9_000_000_000 },
      ],
      journal,
      1,
      FIG_NOW
    );

    expect(fromDivisionOne.runwayDays).toBeCloseTo(1000, 6);
  });

  it('reports no runway for a division that is not in the list', () => {
    const figures = vitalsFigures(
      [{ division: 1, balance: 1_000_000 }],
      [{ atMs: FIG_NOW - FIG_DAY, amount: -30_000 }],
      7,
      FIG_NOW
    );

    expect(figures.runwayDays).toBeNull();
    expect(figures.total).toBe(1_000_000);
  });

  it('reports no runway when nothing was spent', () => {
    const figures = vitalsFigures(
      [{ division: 1, balance: 1_000_000 }],
      [{ atMs: FIG_NOW - FIG_DAY, amount: 5_000 }],
      1,
      FIG_NOW
    );

    expect(figures.runwayDays).toBeNull();
    expect(figures.net).toBe(5_000);
  });
});
