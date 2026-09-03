import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import {
  CUSTOMS_TAXABLE_VALUE,
  DEFAULT_CUSTOMS_TAX_RATE,
  IMPORT_TAXABLE_FRACTION,
  chainCost,
  expandChain,
  isP0,
  piTier,
  type ChainCostResult,
  type PiChain,
  type PiTier,
  type SourcingFloor,
} from './chain';

// The real SDE snapshot, not a fixture: the ticket's numbers are claims about
// the shipped recipe graph, so pinning them against a hand-made stub would pin
// nothing. Read from disk (vitest runs at the project root) rather than
// imported, so the engine itself keeps no data dependency.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** Broadcast Node — the P4 the ticket's worked example uses. */
const BROADCAST_NODE = 2867;
/** The ticket's example run rate: 10 Broadcast Nodes a day. */
const TEN_PER_DAY = 10 / 24;

/**
 * Fixture prices, flat per tier. Deliberately NOT the ticket's live Jita
 * snapshot: those margins came from nine distinct per-type prices that the
 * ticket does not list, so no uniform-per-tier fixture reproduces them. The
 * tax *bases* below are price-free and do reproduce the ticket exactly; these
 * prices only have to preserve the two inversions the ticket pins.
 */
const FIXTURE_UNIT_PRICE: Record<PiTier, number> = {
  0: 5,
  1: 760,
  2: 14_000,
  3: 100_000,
  4: 1_900_000,
};

function fixturePrices(chain: PiChain): Record<number, number> {
  return Object.fromEntries(
    chain.nodes.map((node) => [node.typeId, FIXTURE_UNIT_PRICE[node.tier]])
  );
}

const chain = expandChain(BROADCAST_NODE, pi, { unitsPerHour: TEN_PER_DAY });
const prices = fixturePrices(chain);

function nodeFor(typeId: number) {
  const node = chain.nodes.find((n) => n.typeId === typeId);
  if (!node) throw new Error(`node ${typeId} missing from the expanded chain`);
  return node;
}

function costed(opts: {
  sourcingFloor: SourcingFloor;
  layout?: 'single-planet' | 'planet-per-tier';
  taxRate?: number;
  extractionRate?: number | null;
}) {
  const result = chainCost(chain, {
    prices,
    layout: 'single-planet',
    extractionRate: 1_000_000,
    ...opts,
  });
  if (result.status !== 'costed') throw new Error(`expected a costed result, got ${result.status}`);
  return result;
}

describe('pi.json shape assumptions', () => {
  // Guards #303's PiData reshape: every membership question this engine asks
  // goes through isP0, so a raw[] shape change fails here, loudly and once.
  it('keeps raw and schematics disjoint and complete', () => {
    for (const { typeID } of pi.raw) {
      expect(isP0(typeID, pi)).toBe(true);
      expect(pi.schematics[String(typeID)]).toBeUndefined();
    }
    const inputIds = new Set(
      Object.values(pi.schematics).flatMap((s) => s.inputs.map((i) => i.typeID))
    );
    for (const typeId of inputIds) {
      const madeBySchematic = pi.schematics[String(typeId)] !== undefined;
      expect(madeBySchematic || isP0(typeId, pi)).toBe(true);
    }
  });
});

describe('piTier', () => {
  it('derives the tier from the graph rather than a hardcoded table', () => {
    expect(piTier(BROADCAST_NODE, pi)).toBe(4);
    expect(piTier(17392, pi)).toBe(3); // Data Chips
    expect(piTier(2327, pi)).toBe(2); // Microfiber Shielding
    expect(piTier(3779, pi)).toBe(1); // Biomass
    expect(piTier(2286, pi)).toBe(0); // Planktic Colonies
  });
});

describe('expandChain', () => {
  // Acceptance criterion 1.
  it('reproduces the Broadcast Node chain at 10/day', () => {
    expect(nodeFor(BROADCAST_NODE).unitsPerHour).toBeCloseTo(0.4167, 4);

    for (const p3 of [17392, 17898, 2354]) {
      expect(nodeFor(p3).tier).toBe(3);
      expect(nodeFor(p3).unitsPerHour).toBeCloseTo(2.5, 6);
    }

    for (const p2 of [2327, 2312, 2321, 9840, 2329, 3697]) {
      expect(nodeFor(p2).tier).toBe(2);
      expect(nodeFor(p2).unitsPerHour).toBeCloseTo(8.3333, 4);
    }

    // The P1s each single P2 consumes.
    for (const p1 of [3779, 3683, 2401, 2389, 2396, 2399]) {
      expect(nodeFor(p1).tier).toBe(1);
      expect(nodeFor(p1).unitsPerHour).toBeCloseTo(66.6667, 4);
    }
    // ...and the three feeding two P2s each, which are therefore doubled.
    for (const p1 of [2397, 9828, 2392]) {
      expect(nodeFor(p1).unitsPerHour).toBeCloseTo(133.3333, 4);
    }

    for (const p0 of [2286, 2310, 2306, 2308, 2288, 2270]) {
      expect(nodeFor(p0).tier).toBe(0);
      expect(nodeFor(p0).unitsPerHour).toBeCloseTo(10_000, 6);
    }
    for (const p0 of [2305, 2307, 2311]) {
      expect(nodeFor(p0).unitsPerHour).toBeCloseTo(20_000, 6);
    }
  });

  it('derives factory throughput from each schematic, giving 40/5/3/1 per hour', () => {
    expect(nodeFor(3779).outputPerHour).toBeCloseTo(40, 6); // P1
    expect(nodeFor(2327).outputPerHour).toBeCloseTo(5, 6); // P2
    expect(nodeFor(17392).outputPerHour).toBeCloseTo(3, 6); // P3
    expect(nodeFor(BROADCAST_NODE).outputPerHour).toBeCloseTo(1, 6); // P4
    expect(nodeFor(3779).cyclesPerHour).toBeCloseTo(2, 6); // 1800s cycle
    expect(nodeFor(17392).cyclesPerHour).toBeCloseTo(1, 6); // 3600s cycle
  });

  it('counts factory pins as ceil(need / output)', () => {
    expect(nodeFor(BROADCAST_NODE).factoryPins).toBe(1); // 0.42 of 1/hr
    expect(nodeFor(17392).factoryPins).toBe(1); // 2.5 of 3/hr
    expect(nodeFor(2327).factoryPins).toBe(2); // 8.33 of 5/hr
    expect(nodeFor(3779).factoryPins).toBe(2); // 66.67 of 40/hr
    expect(nodeFor(2397).factoryPins).toBe(4); // 133.33 of 40/hr
  });

  // Acceptance criterion 5.
  it('terminates at P0 and never gives it a factory count', () => {
    const p0s = chain.nodes.filter((n) => n.tier === 0);
    expect(p0s.length).toBe(9);
    for (const node of p0s) {
      expect(node.factoryPins).toBeNull();
      expect(node.cyclesPerHour).toBeNull();
      expect(node.outputPerHour).toBeNull();
      expect(node.inputs).toEqual([]);
    }
  });
});

describe('customs taxable values', () => {
  it('exports the per-tier taxable values the tax is charged on', () => {
    expect(CUSTOMS_TAXABLE_VALUE).toEqual({
      0: 5,
      1: 400,
      2: 7_200,
      3: 60_000,
      4: 1_200_000,
    });
    expect(IMPORT_TAXABLE_FRACTION).toBe(0.5);
    expect(DEFAULT_CUSTOMS_TAX_RATE).toBe(0.1);
  });
});

describe('chainCost tax base', () => {
  /**
   * These five bases are pure functions of the chain and the taxable-value
   * constants — no price enters them — and each one reproduces a column of the
   * ticket's own margin tables exactly. They are simultaneously the check that
   * CUSTOMS_TAXABLE_VALUE is right: the bases are linear in those five numbers,
   * so all five matching pins the constant.
   */
  it.each([
    ['P3' as const, 'single-planet' as const, 1_740_000],
    ['P2' as const, 'single-planet' as const, 1_632_000],
    ['P1' as const, 'single-planet' as const, 1_584_000],
    ['P0' as const, 'single-planet' as const, 1_920_000],
    ['P1' as const, 'planet-per-tier' as const, 4_500_000],
  ])('floor %s / %s taxes a base of %i per Broadcast Node', (sourcingFloor, layout, base) => {
    const result = costed({ sourcingFloor, layout, taxRate: 0.15 });
    expect(result.taxBase).toBeCloseTo(base, 3);
    expect(result.taxCost).toBeCloseTo(0.15 * base, 3);
  });

  it('charges nothing between two tiers made on the same planet', () => {
    // The whole point: single-planet pays one import and one export, while
    // planet-per-tier pays an export and an import at every hop.
    const single = costed({ sourcingFloor: 'P1', layout: 'single-planet', taxRate: 0.15 });
    const perTier = costed({ sourcingFloor: 'P1', layout: 'planet-per-tier', taxRate: 0.15 });
    expect(single.planetCount).toBe(1);
    expect(perTier.planetCount).toBe(3); // P2, P3, P4
    expect(perTier.taxBase).toBeGreaterThan(single.taxBase);
  });
});

describe('chainCost', () => {
  // Acceptance criterion 2: layout inverts the sign.
  it('makes the P1 floor profitable on one planet and unprofitable per tier', () => {
    const single = costed({ sourcingFloor: 'P1', layout: 'single-planet', taxRate: 0.15 });
    const perTier = costed({ sourcingFloor: 'P1', layout: 'planet-per-tier', taxRate: 0.15 });

    expect(single.margin).toBeGreaterThan(0);
    expect(perTier.margin).toBeLessThan(0);
    expect(single.margin).toBeCloseTo(203_200, 3);
    expect(perTier.margin).toBeCloseTo(-234_200, 3);
  });

  // Acceptance criterion 3: the rate inverts which floor wins.
  const floors: SourcingFloor[] = ['P0', 'P1', 'P2', 'P3'];
  function bestFloor(taxRate: number): SourcingFloor {
    return floors.reduce((best, floor) =>
      costed({ sourcingFloor: floor, taxRate }).margin >
      costed({ sourcingFloor: best, taxRate }).margin
        ? floor
        : best
    );
  }

  it('lets full vertical integration win only when the tax rate is zero', () => {
    expect(bestFloor(0)).toBe('P0');
  });

  it.each([[0.1], [0.15], [0.17]])('makes buying P1 win at a %d rate', (taxRate) => {
    expect(bestFloor(taxRate)).toBe('P1');
  });

  // Acceptance criterion 4: no residual tax constant.
  it('removes every tax term at a zero rate, making layout irrelevant', () => {
    for (const sourcingFloor of floors) {
      const single = costed({ sourcingFloor, layout: 'single-planet', taxRate: 0 });
      const perTier = costed({ sourcingFloor, layout: 'planet-per-tier', taxRate: 0 });
      expect(single.taxCost).toBe(0);
      expect(perTier.taxCost).toBe(0);
      expect(single.totalCost).toBeCloseTo(perTier.totalCost, 6);
      expect(single.margin).toBeCloseTo(perTier.margin, 6);
    }
  });

  it('defaults to the highsec NPC rate', () => {
    const explicit = costed({ sourcingFloor: 'P1', taxRate: DEFAULT_CUSTOMS_TAX_RATE });
    const result = chainCost(chain, {
      prices,
      sourcingFloor: 'P1',
      layout: 'single-planet',
    });
    expect(result.status).toBe('costed');
    expect((result as typeof explicit).taxCost).toBeCloseTo(explicit.taxCost, 6);
  });

  it('buys only at the floor tier and never below it', () => {
    const p1 = costed({ sourcingFloor: 'P1' });
    // 1920 P1 per Broadcast Node at 760 ISK, and no P0 bought at all.
    expect(p1.sourcedCost).toBeCloseTo(1_459_200, 3);
    expect(p1.sourced.some((line) => line.tier === 0)).toBe(false);
    expect(p1.sourced.every((line) => line.tier === 1)).toBe(true);
  });
});

describe('chainCost with no observed extraction rate', () => {
  // Acceptance criterion 6.
  const withoutRate = (sourcingFloor: SourcingFloor): ChainCostResult =>
    chainCost(chain, {
      prices,
      sourcingFloor,
      layout: 'single-planet',
      taxRate: 0.1,
      extractionRate: null,
    });

  it.each([['P1' as const], ['P2' as const], ['P3' as const]])(
    'still costs the %s floor in full',
    (sourcingFloor) => {
      const result = withoutRate(sourcingFloor);
      expect(result.status).toBe('costed');
      if (result.status !== 'costed') return;
      expect(Number.isFinite(result.margin)).toBe(true);
      expect(result.extraction).toBeNull();
    }
  );

  it('declines the P0 floor rather than guessing, returning no number', () => {
    const result = withoutRate('P0');
    expect(result.status).toBe('needs-extraction-rate');
    if (result.status !== 'needs-extraction-rate') return;
    expect(result.sourcingFloor).toBe('P0');
    expect(result).not.toHaveProperty('margin');
    expect(result).not.toHaveProperty('totalCost');
    // It still says what an assumption would have to cover.
    expect(result.p0PerHour).toHaveLength(9);
    expect(result.p0PerHour.find((line) => line.typeId === 2286)?.unitsPerHour).toBeCloseTo(
      10_000,
      6
    );
  });

  it('treats a non-positive rate the same as none', () => {
    const result = chainCost(chain, {
      prices,
      sourcingFloor: 'P0',
      layout: 'single-planet',
      extractionRate: 0,
    });
    expect(result.status).toBe('needs-extraction-rate');
  });

  it('sizes extraction once a rate is supplied', () => {
    const result = costed({ sourcingFloor: 'P0', extractionRate: 3_000 });
    expect(result.extraction).not.toBeNull();
    expect(result.extraction?.ratePerHour).toBe(3_000);
    // 10,000/hr needs 4 extractors at 3,000/hr; the doubled P0s need 7.
    expect(result.extraction?.byType.find((l) => l.typeId === 2286)?.extractors).toBe(4);
    expect(result.extraction?.byType.find((l) => l.typeId === 2305)?.extractors).toBe(7);
    expect(result.extraction?.totalExtractors).toBe(6 * 4 + 3 * 7);
  });

  it('never derives a rate from anything the engine can see', () => {
    // A rate is the only way to answer the P0 floor; nothing else substitutes.
    const a = costed({ sourcingFloor: 'P0', extractionRate: 3_000 });
    const b = costed({ sourcingFloor: 'P0', extractionRate: 9_000 });
    expect(a.margin).toBeCloseTo(b.margin, 6); // the rate sizes, it does not price
    expect(a.extraction?.totalExtractors).toBeGreaterThan(b.extraction?.totalExtractors ?? 0);
  });
});

describe('chainCost guards', () => {
  it('rejects a floor at or above the target tier', () => {
    const p2Chain = expandChain(2327, pi, { unitsPerHour: 1 });
    expect(() =>
      chainCost(p2Chain, {
        prices: fixturePrices(p2Chain),
        sourcingFloor: 'P2',
        layout: 'single-planet',
      })
    ).toThrow(/floor/i);
  });

  it('rejects a missing price rather than costing it as free', () => {
    expect(() =>
      chainCost(chain, { prices: {}, sourcingFloor: 'P1', layout: 'single-planet' })
    ).toThrow(/price/i);
  });
});
