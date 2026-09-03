import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { expandChain, type PiChain, type PiTier } from '@/engine/pi/chain';
import {
  costPlan,
  factoryPinsAbove,
  missingPriceIds,
  planRows,
  planetCountFor,
  sensitivityGrid,
  sourcedIdsFor,
  taxSplit,
  validFloors,
} from './planModel';

/** The real SDE snapshot: the ticket's acceptance numbers are claims about the shipped graph. */
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BROADCAST_NODE = 2867;
/** Silicon, a P1 — the smallest chain with a legal floor (P0 only). */
const SILICON = 9828;
const TEN_PER_DAY = 10 / 24;

/** Flat per tier, same shape `engine/pi/chain.test.ts` uses: enough to preserve the inversions. */
const UNIT_PRICE: Record<PiTier, number> = {
  0: 5,
  1: 760,
  2: 14_000,
  3: 100_000,
  4: 1_900_000,
};

function pricesFor(chain: PiChain): Record<number, number> {
  return Object.fromEntries(chain.nodes.map((node) => [node.typeId, UNIT_PRICE[node.tier]]));
}

const chain = expandChain(BROADCAST_NODE, pi, { unitsPerHour: TEN_PER_DAY });
const prices = pricesFor(chain);

describe('validFloors', () => {
  it('offers only floors strictly below the target, since a floor at its tier makes nothing', () => {
    expect(validFloors(4)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(validFloors(2)).toEqual(['P0', 'P1']);
    expect(validFloors(1)).toEqual(['P0']);
  });
});

describe('factoryPinsAbove', () => {
  it("counts the ticket's 16 pins for a Broadcast Node at 10/day off a P1 floor", () => {
    expect(factoryPinsAbove(chain, 'P1')).toBe(16);
  });

  it('shrinks as the floor rises, because a bought tier needs no factory', () => {
    expect(factoryPinsAbove(chain, 'P2')).toBe(4);
    expect(factoryPinsAbove(chain, 'P3')).toBe(1);
  });

  it("counts the P1 factories the P0 floor now has to run itself, on top of the P1 floor's 16", () => {
    // 40 pins plus 9 extractors is what "supply your own P0" actually costs —
    // the reason the footprint rides beside the margin.
    expect(factoryPinsAbove(chain, 'P0')).toBe(40);
  });
});

describe('planetCountFor', () => {
  it('is one planet under single-planet, whatever the floor', () => {
    expect(planetCountFor(chain, 'P1', 'single-planet')).toBe(1);
    expect(planetCountFor(chain, 'P3', 'single-planet')).toBe(1);
  });

  it('is one planet per made tier under planet-per-tier', () => {
    expect(planetCountFor(chain, 'P1', 'planet-per-tier')).toBe(3);
    expect(planetCountFor(chain, 'P3', 'planet-per-tier')).toBe(1);
  });

  it('agrees with the engine, which is the number the tax is actually charged over', () => {
    const result = costPlan(chain, {
      prices,
      sourcingFloor: 'P1',
      layout: 'planet-per-tier',
      taxRate: 0.15,
    });
    if (result.status !== 'costed') throw new Error(result.status);
    expect(result.breakdown.planetCount).toBe(planetCountFor(chain, 'P1', 'planet-per-tier'));
  });
});

describe('sourcedIdsFor', () => {
  it('stops at the floor: buying P1 means the P0 beneath it is never incurred', () => {
    const ids = sourcedIdsFor(chain, 'P1');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const node = chain.nodes.find((n) => n.typeId === id);
      expect(node?.tier).toBe(1);
    }
  });

  it('includes a below-floor input consumed directly by a higher tier', () => {
    // Nothing in the Broadcast Node chain skips a tier, so the P0 floor is the
    // check that the walk reaches the bottom when the floor says to.
    const ids = sourcedIdsFor(chain, 'P0');
    expect(ids).toHaveLength(9);
  });
});

describe('missingPriceIds', () => {
  it('is empty when the floor and the target are both priced', () => {
    expect(missingPriceIds(chain, 'P1', prices)).toEqual([]);
  });

  it('names only what this floor actually buys, not the whole chain', () => {
    const p3Only: Record<number, number> = { ...pricesFor(chain) };
    delete p3Only[2389]; // Plasmoids, a P1 the P3 floor never touches
    expect(missingPriceIds(chain, 'P3', p3Only)).toEqual([]);
  });

  it('reports a missing target price, which voids every floor', () => {
    const noTarget = { ...prices };
    delete noTarget[BROADCAST_NODE];
    expect(missingPriceIds(chain, 'P1', noTarget)).toContain(BROADCAST_NODE);
  });
});

describe('costPlan', () => {
  it("costs the ticket's worked example to a positive margin", () => {
    const result = costPlan(chain, {
      prices,
      sourcingFloor: 'P1',
      layout: 'single-planet',
      taxRate: 0.15,
    });
    if (result.status !== 'costed') throw new Error(result.status);
    expect(result.breakdown.margin).toBeGreaterThan(0);
  });

  it('turns that same example negative on planet-per-tier, from the layout alone', () => {
    const result = costPlan(chain, {
      prices,
      sourcingFloor: 'P1',
      layout: 'planet-per-tier',
      taxRate: 0.15,
    });
    if (result.status !== 'costed') throw new Error(result.status);
    expect(result.breakdown.margin).toBeLessThan(0);
  });

  it('surfaces needs-extraction-rate on the P0 floor rather than a zero', () => {
    const result = costPlan(chain, {
      prices,
      sourcingFloor: 'P0',
      layout: 'single-planet',
      taxRate: 0,
    });
    expect(result.status).toBe('needs-extraction-rate');
    if (result.status !== 'needs-extraction-rate') throw new Error(result.status);
    expect(result.p0PerHour.length).toBe(9);
  });

  it('degrades to not-priceable instead of letting the engine throw', () => {
    const result = costPlan(chain, {
      prices: {},
      sourcingFloor: 'P1',
      layout: 'single-planet',
      taxRate: 0.15,
    });
    expect(result.status).toBe('not-priceable');
    if (result.status !== 'not-priceable') throw new Error(result.status);
    expect(result.missing.map((line) => line.typeId)).toContain(BROADCAST_NODE);
  });

  it('never asks the engine for a floor at or above the target tier', () => {
    const p1Chain = expandChain(SILICON, pi, { unitsPerHour: 10 });
    const result = costPlan(p1Chain, {
      prices: pricesFor(p1Chain),
      sourcingFloor: 'P1',
      layout: 'single-planet',
      taxRate: 0.1,
    });
    expect(result.status).toBe('floor-above-target');
  });
});

describe('taxSplit', () => {
  const costed = (layout: 'single-planet' | 'planet-per-tier') => {
    const result = costPlan(chain, {
      prices,
      sourcingFloor: 'P1',
      layout,
      taxRate: 0.15,
    });
    if (result.status !== 'costed') throw new Error(result.status);
    return result.breakdown;
  };

  it('accounts for the whole tax base, so nothing is invented or lost', () => {
    for (const layout of ['single-planet', 'planet-per-tier'] as const) {
      const breakdown = costed(layout);
      const split = taxSplit(breakdown, 4);
      expect(split.importBase + split.exportBase + split.betweenPlanetsBase).toBeCloseTo(
        breakdown.taxBase,
        6
      );
      expect(split.importCost + split.exportCost + split.betweenPlanetsCost).toBeCloseTo(
        breakdown.taxCost,
        6
      );
    }
  });

  it('charges nothing between planets when every made tier shares one', () => {
    expect(taxSplit(costed('single-planet'), 4).betweenPlanetsBase).toBeCloseTo(0, 6);
  });

  it('is where the planet-per-tier penalty lands', () => {
    expect(taxSplit(costed('planet-per-tier'), 4).betweenPlanetsBase).toBeGreaterThan(0);
  });
});

describe('planRows', () => {
  const rows = planRows(chain, 'P1', prices);

  it('marks every tier above the floor as made and the floor itself as bought', () => {
    const broadcast = rows.find((row) => row.typeId === BROADCAST_NODE);
    expect(broadcast?.role).toBe('make');
    expect(rows.filter((row) => row.tier === 1).every((row) => row.role === 'buy')).toBe(true);
  });

  it('drops the tiers below the floor entirely — buying P1 never incurs its P0', () => {
    expect(rows.some((row) => row.tier === 0)).toBe(false);
  });

  it('carries the need per hour and the factory pins the tier costs', () => {
    const broadcast = rows.find((row) => row.typeId === BROADCAST_NODE);
    expect(broadcast?.unitsPerHour).toBeCloseTo(TEN_PER_DAY, 10);
    expect(broadcast?.factoryPins).toBe(1);
  });

  it('reads make-or-buy from what processing adds, not from the floor', () => {
    const broadcast = rows.find((row) => row.typeId === BROADCAST_NODE);
    // 1,900,000 out against 3 x 100,000 x 6 in, per hour at 10/day.
    expect(broadcast?.valueAddPerHour).toBeGreaterThan(0);
    expect(broadcast?.read).toBe('make');
  });

  it('leaves the value-add unknown rather than zero when a price is missing', () => {
    const sparse = { ...prices };
    delete sparse[17392]; // Data Chips, a P3 input of the target
    const sparseRows = planRows(chain, 'P1', sparse);
    const broadcast = sparseRows.find((row) => row.typeId === BROADCAST_NODE);
    expect(broadcast?.valueAddPerHour).toBeNull();
    expect(broadcast?.read).toBeNull();
  });

  it('lists the target first and then descends by tier', () => {
    expect(rows[0]?.typeId).toBe(BROADCAST_NODE);
    const tiers = rows.map((row) => row.tier);
    expect([...tiers].sort((a, b) => b - a)).toEqual(tiers);
  });
});

describe('sensitivityGrid', () => {
  const grid = sensitivityGrid(chain, {
    prices,
    floors: validFloors(4),
    rates: [0, 0.1, 0.15],
    layout: 'single-planet',
    extractionRate: 1_000_000,
  });

  it('gives a row per floor with its own footprint', () => {
    expect(grid.map((row) => row.floor)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(grid[1]?.factoryPins).toBe(16);
    expect(grid[1]?.planetCount).toBe(1);
    expect(grid[0]?.extractors).toBe(9);
    expect(grid[1]?.extractors).toBeNull();
  });

  it('shows the inversion the ticket is built on: P0 wins at 0%, P1 at 10% and up', () => {
    const marginAt = (floor: string, rate: number) => {
      const cell = grid.find((row) => row.floor === floor)?.cells.find((c) => c.rate === rate);
      if (!cell || cell.status !== 'costed') throw new Error(`no margin for ${floor} at ${rate}`);
      return cell.margin;
    };
    expect(marginAt('P0', 0)).toBeGreaterThan(marginAt('P1', 0));
    expect(marginAt('P1', 0.1)).toBeGreaterThan(marginAt('P0', 0.1));
    expect(marginAt('P1', 0.15)).toBeGreaterThan(marginAt('P0', 0.15));
  });

  it('marks the winning floor at each rate so the inversion is visible, not implied', () => {
    const winnerAt = (rate: number) =>
      grid.find((row) => row.cells.find((c) => c.rate === rate)?.best)?.floor;
    expect(winnerAt(0)).toBe('P0');
    expect(winnerAt(0.1)).toBe('P1');
  });

  it('keeps the P0 row explicit about needing a yield assumption, never zero', () => {
    const noRate = sensitivityGrid(chain, {
      prices,
      floors: validFloors(4),
      rates: [0, 0.1],
      layout: 'single-planet',
      extractionRate: null,
    });
    const p0 = noRate.find((row) => row.floor === 'P0');
    expect(p0?.cells.every((cell) => cell.status === 'needs-extraction-rate')).toBe(true);
    expect(p0?.extractors).toBeNull();
    // and the other floors still answer, because they buy their inputs
    expect(noRate.find((row) => row.floor === 'P1')?.cells[0]?.status).toBe('costed');
  });
});
