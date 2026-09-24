import { describe, it, expect } from 'vitest';
import { buildInjectorFacts } from './injectorFacts';

const scheduled = [{ sp: 1_000_000 }, { sp: 500_000 }];

describe('buildInjectorFacts', () => {
  it('reports unknown SP when totalSp has not loaded', () => {
    const facts = buildInjectorFacts(scheduled, null, null, null);
    expect(facts.spUnknown).toBe(true);
    expect(facts.spToTrain).toBe(1_500_000);
    expect(facts.none).toBe(false);
    expect(facts.count).toBe(0);
  });

  it('reports "none" when unallocated SP already covers the plan', () => {
    const facts = buildInjectorFacts(scheduled, 10_000_000, 2_000_000, null);
    expect(facts.spUnknown).toBe(false);
    expect(facts.none).toBe(true);
    expect(facts.gapSp).toBe(0);
    expect(facts.count).toBe(0);
  });

  it('walks brackets from totalSp + unallocatedSp, crediting unallocated against the gap', () => {
    // spToTrain 1.5M, unallocated 500k -> gap 1M. Bracket SP starts at
    // totalSp (4.3M) + unallocated (500k) = 4.8M, so the walk crosses 5M.
    const facts = buildInjectorFacts(scheduled, 4_300_000, 500_000, null);
    expect(facts.gapSp).toBe(1_000_000);
    expect(facts.count).toBe(3);
    expect(facts.surplusSp).toBe(300_000);
  });

  it('never goes negative when unallocated exceeds SP to train', () => {
    const facts = buildInjectorFacts(scheduled, 10_000_000, 50_000_000, null);
    expect(facts.gapSp).toBe(0);
    expect(facts.none).toBe(true);
  });

  it('prices from the hub aggregate, null meaning no sell orders rather than 0 ISK', () => {
    const covered = buildInjectorFacts(scheduled, 4_300_000, 500_000, { sellMin: 700_000_000 });
    expect(covered.pricePerInjector).toBe(700_000_000);
    expect(covered.priceTotal).toBe(700_000_000 * 3);

    const noOrders = buildInjectorFacts(scheduled, 4_300_000, 500_000, { sellMin: null });
    expect(noOrders.pricePerInjector).toBeNull();
    expect(noOrders.priceTotal).toBeNull();
  });
});
