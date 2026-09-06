import { describe, it, expect } from 'vitest';
import {
  ORDER_PROBLEMS,
  DEFAULT_PROBLEM_THRESHOLDS,
  worstProblem,
  allProblems,
  type OrderProblemFacts,
} from './orderProblems';

/** A perfectly healthy sell order: nothing wrong anywhere. */
function healthySellFacts(overrides: Partial<OrderProblemFacts> = {}): OrderProblemFacts {
  return {
    isBuyOrder: false,
    belowFloor: false,
    undercutScope: null,
    daysLeft: 30,
    volumeRemain: 10,
    daysWithoutSale: 0,
    outlastsOrder: false,
    ...overrides,
  };
}

function healthyBuyFacts(overrides: Partial<OrderProblemFacts> = {}): OrderProblemFacts {
  return healthySellFacts({ isBuyOrder: true, ...overrides });
}

describe('ORDER_PROBLEMS', () => {
  it('is ordered worst first, ending in healthy', () => {
    expect(ORDER_PROBLEMS).toEqual([
      'belowFloor',
      'undercutStation',
      'undercutSystem',
      'undercutRegion',
      'expiringOrStale',
      'outbid',
      'healthy',
    ]);
  });
});

describe('worstProblem / allProblems — sell order precedence', () => {
  it('a perfectly fine sell order is healthy', () => {
    expect(worstProblem(healthySellFacts())).toBe('healthy');
    expect(allProblems(healthySellFacts())).toEqual(['healthy']);
  });

  it('belowFloor beats everything else', () => {
    const facts = healthySellFacts({
      belowFloor: true,
      undercutScope: 'station',
      daysLeft: 1,
    });
    expect(worstProblem(facts)).toBe('belowFloor');
  });

  it('undercutStation beats undercutSystem/Region and expiringOrStale', () => {
    const facts = healthySellFacts({ undercutScope: 'station', daysLeft: 1 });
    expect(worstProblem(facts)).toBe('undercutStation');
  });

  it('undercutSystem beats undercutRegion', () => {
    const facts = healthySellFacts({ undercutScope: 'system' });
    expect(worstProblem(facts)).toBe('undercutSystem');
  });

  it('undercutRegion beats expiringOrStale', () => {
    const facts = healthySellFacts({ undercutScope: 'region', daysLeft: 1 });
    expect(worstProblem(facts)).toBe('undercutRegion');
  });

  it('expiringOrStale fires when daysLeft is at or under the threshold and volume remains', () => {
    expect(worstProblem(healthySellFacts({ daysLeft: 7, volumeRemain: 1 }))).toBe(
      'expiringOrStale'
    );
    expect(worstProblem(healthySellFacts({ daysLeft: 6, volumeRemain: 1 }))).toBe(
      'expiringOrStale'
    );
    expect(worstProblem(healthySellFacts({ daysLeft: 8, volumeRemain: 1 }))).toBe('healthy');
  });

  it('expiringOrStale never fires when volumeRemain is 0, even if daysLeft is under threshold', () => {
    expect(worstProblem(healthySellFacts({ daysLeft: 1, volumeRemain: 0 }))).toBe('healthy');
  });

  it('expiringOrStale fires from daysWithoutSale at or over the stale threshold, regardless of daysLeft', () => {
    expect(
      worstProblem(healthySellFacts({ daysLeft: 30, daysWithoutSale: 12, volumeRemain: 5 }))
    ).toBe('expiringOrStale');
    expect(
      worstProblem(healthySellFacts({ daysLeft: 30, daysWithoutSale: 11, volumeRemain: 5 }))
    ).toBe('healthy');
  });

  it('expiringOrStale fires when outlastsOrder is true and volume remains', () => {
    expect(
      worstProblem(healthySellFacts({ daysLeft: 30, outlastsOrder: true, volumeRemain: 5 }))
    ).toBe('expiringOrStale');
  });

  it('outlastsOrder with zero volumeRemain does not trigger expiringOrStale', () => {
    expect(
      worstProblem(healthySellFacts({ daysLeft: 30, outlastsOrder: true, volumeRemain: 0 }))
    ).toBe('healthy');
  });

  it('respects custom thresholds', () => {
    const thresholds = { expiringWithinDays: 3, staleAfterDays: 20 };
    expect(worstProblem(healthySellFacts({ daysLeft: 5, volumeRemain: 1 }), thresholds)).toBe(
      'healthy'
    );
    expect(worstProblem(healthySellFacts({ daysLeft: 3, volumeRemain: 1 }), thresholds)).toBe(
      'expiringOrStale'
    );
  });

  it('DEFAULT_PROBLEM_THRESHOLDS is 7 / 12', () => {
    expect(DEFAULT_PROBLEM_THRESHOLDS).toEqual({ expiringWithinDays: 7, staleAfterDays: 12 });
  });
});

describe('worstProblem / allProblems — buy order precedence', () => {
  it('a perfectly fine buy order is healthy', () => {
    expect(worstProblem(healthyBuyFacts())).toBe('healthy');
  });

  it('a buy order is never belowFloor, even if the flag is set', () => {
    const facts = healthyBuyFacts({ belowFloor: true });
    expect(worstProblem(facts)).toBe('healthy');
  });

  it('any undercut scope on a buy order maps to outbid', () => {
    expect(worstProblem(healthyBuyFacts({ undercutScope: 'station' }))).toBe('outbid');
    expect(worstProblem(healthyBuyFacts({ undercutScope: 'system' }))).toBe('outbid');
    expect(worstProblem(healthyBuyFacts({ undercutScope: 'region' }))).toBe('outbid');
  });

  it('outbid beats expiringOrStale for a buy order', () => {
    const facts = healthyBuyFacts({ undercutScope: 'region', daysLeft: 1, volumeRemain: 1 });
    expect(worstProblem(facts)).toBe('outbid');
  });

  it('a buy order with no undercut but expiring/stale is expiringOrStale', () => {
    expect(worstProblem(healthyBuyFacts({ daysLeft: 1, volumeRemain: 1 }))).toBe('expiringOrStale');
  });
});

describe('worstProblem === allProblems(...)[0] ?? healthy, by construction', () => {
  const cases: OrderProblemFacts[] = [
    healthySellFacts(),
    healthySellFacts({ belowFloor: true, undercutScope: 'station' }),
    healthySellFacts({ undercutScope: 'system' }),
    healthySellFacts({ undercutScope: 'region' }),
    healthySellFacts({ daysLeft: 1, volumeRemain: 1 }),
    healthyBuyFacts({ undercutScope: 'station' }),
    healthyBuyFacts({ daysLeft: 1, volumeRemain: 1 }),
    healthyBuyFacts(),
  ];

  it.each(cases)('worstProblem matches allProblems[0] for %j', (facts) => {
    expect(worstProblem(facts)).toBe(allProblems(facts)[0] ?? 'healthy');
  });
});

describe('allProblems', () => {
  it('returns only ["healthy"] when there is no problem', () => {
    expect(allProblems(healthySellFacts())).toEqual(['healthy']);
    expect(allProblems(healthyBuyFacts())).toEqual(['healthy']);
  });

  it('never mixes healthy with a real problem', () => {
    const facts = healthySellFacts({ belowFloor: true, undercutScope: 'station', daysLeft: 1 });
    const problems = allProblems(facts);
    expect(problems).not.toContain('healthy');
    expect(problems.length).toBeGreaterThan(0);
  });

  it('lists every applicable problem, worst first, for a sell order', () => {
    const facts = healthySellFacts({
      belowFloor: true,
      undercutScope: 'station',
      daysLeft: 1,
      volumeRemain: 1,
    });
    expect(allProblems(facts)).toEqual(['belowFloor', 'undercutStation', 'expiringOrStale']);
  });

  it('lists undercutSystem alone when only that scope applies', () => {
    expect(allProblems(healthySellFacts({ undercutScope: 'system' }))).toEqual(['undercutSystem']);
  });

  it('lists outbid alone for a buy order with an undercut scope, no expiringOrStale', () => {
    expect(allProblems(healthyBuyFacts({ undercutScope: 'region' }))).toEqual(['outbid']);
  });

  it('lists outbid + expiringOrStale for a buy order hit by both', () => {
    const facts = healthyBuyFacts({ undercutScope: 'region', daysLeft: 1, volumeRemain: 1 });
    expect(allProblems(facts)).toEqual(['outbid', 'expiringOrStale']);
  });
});
