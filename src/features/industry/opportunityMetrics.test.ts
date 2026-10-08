import { describe, expect, it } from 'vitest';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { OpportunityRow } from './opportunities';
import {
  matchesStockFilter,
  MOSTLY_COVERED_PCT,
  stockCoverage,
  unitCount,
  unitMargin,
} from './opportunityMetrics';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

function row(runs: number, profit: number | null, productQuantity = 1): OpportunityRow {
  const blueprint: CharacterBlueprint = {
    item_id: 10,
    type_id: 1,
    quantity: 1,
    material_efficiency: 10,
    time_efficiency: 20,
    runs,
    location_id: 60003760,
    location_flag: 'Hangar',
  };
  return {
    candidate: {
      id: 'a',
      characterId: 1,
      characterName: 'Pilot',
      blueprint,
      catalogEntry: {
        blueprintTypeID: 1,
        blueprint: {
          name: 'Blueprint 1',
          time: 1200,
          materials: [],
          products: [{ typeID: 2, quantity: productQuantity }],
          skills: [],
          activity: 'manufacturing',
        },
        productTypeID: 2,
        productName: 'Product',
        productNameLower: 'product',
      },
    },
    result: { profit } as BuildResult,
    sellDepthIsk: null,
    hub: DEFAULT_TRADE_HUB,
    materialSourcing: {},
    buildHere: [],
    orderDepth: 'unknown',
  };
}

describe('unitCount', () => {
  it('multiplies product quantity by a BPC’s remaining runs', () => {
    expect(unitCount(row(5, 0, 10))).toBe(50);
  });

  it('prices a BPO (runs: -1) at one run, not a negative count', () => {
    expect(unitCount(row(-1, 0, 10))).toBe(10);
  });
});

describe('unitMargin', () => {
  it('gives a BPO row a real per-unit margin', () => {
    expect(unitMargin(row(-1, 1000, 10))).toBe(100);
  });

  it('is null when the row is unpriced', () => {
    expect(unitMargin(row(-1, null))).toBeNull();
  });
});

function stockRow(lines: { owned: number; buy: number; price: number | null }[]): OpportunityRow {
  const base = row(1, 0);
  const materials = lines.map((l) => ({
    ownedQuantity: l.owned,
    remainingQuantity: l.buy,
    unitPrice: l.price,
    lineCost: l.price === null ? 0 : l.buy * l.price,
    unpriced: l.price === null,
  }));
  return {
    ...base,
    result: { materials, profit: 0 } as unknown as BuildResult,
  };
}

describe('stockCoverage', () => {
  it('is 100% with nothing to buy when stock covers everything', () => {
    expect(stockCoverage(stockRow([{ owned: 10, buy: 0, price: 5 }]))).toEqual({
      coveredPct: 100,
      stillToBuyIsk: 0,
    });
  });

  it('splits owned value from the shortfall', () => {
    expect(stockCoverage(stockRow([{ owned: 5, buy: 5, price: 10 }]))).toEqual({
      coveredPct: 50,
      stillToBuyIsk: 50,
    });
  });

  it('is 0% when nothing is owned', () => {
    expect(stockCoverage(stockRow([{ owned: 0, buy: 4, price: 10 }]))?.coveredPct).toBe(0);
  });

  it('is null when any material is unpriced', () => {
    expect(
      stockCoverage(
        stockRow([
          { owned: 5, buy: 0, price: 10 },
          { owned: 0, buy: 1, price: null },
        ])
      )
    ).toBeNull();
  });

  it('is null for a row with no materials', () => {
    expect(stockCoverage(stockRow([]))).toBeNull();
  });
});

describe('matchesStockFilter', () => {
  const at = (pct: number) => stockRow([{ owned: pct, buy: 100 - pct, price: 1 }]);

  it('passes everything, including unpriced rows, for "any"', () => {
    expect(matchesStockFilter(stockRow([{ owned: 0, buy: 1, price: null }]), 'any')).toBe(true);
  });

  it('includes a row at exactly the mostly threshold and excludes one below', () => {
    expect(matchesStockFilter(at(MOSTLY_COVERED_PCT), 'mostly')).toBe(true);
    expect(matchesStockFilter(at(MOSTLY_COVERED_PCT - 1), 'mostly')).toBe(false);
  });

  it('requires nothing left to buy for "full"', () => {
    expect(matchesStockFilter(at(100), 'full')).toBe(true);
    expect(matchesStockFilter(at(99), 'full')).toBe(false);
  });

  it('excludes unpriced rows from "mostly" and "full"', () => {
    const r = stockRow([{ owned: 0, buy: 1, price: null }]);
    expect(matchesStockFilter(r, 'mostly')).toBe(false);
    expect(matchesStockFilter(r, 'full')).toBe(false);
  });
});
