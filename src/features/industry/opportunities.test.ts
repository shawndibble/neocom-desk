import { describe, expect, it } from 'vitest';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { BuildResult } from '@/engine/industry/types';
import {
  autoRecalculates,
  buildOpportunityCandidates,
  opportunitiesCacheKey,
  rankOpportunityRows,
  type OpportunityCandidate,
  type UnrankedOpportunityRow,
} from './opportunities';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

function catalogEntry(
  blueprintTypeID: number,
  activity: 'manufacturing' | 'reaction' = 'manufacturing'
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: {
      name: `Blueprint ${blueprintTypeID}`,
      time: 1200,
      materials: [{ typeID: 34, quantity: 100 }],
      products: [{ typeID: blueprintTypeID + 1, quantity: 1 }],
      skills: [],
      activity,
    },
    productTypeID: blueprintTypeID + 1,
    productName: `Product ${blueprintTypeID}`,
    productNameLower: `product ${blueprintTypeID}`,
  };
}

function catalog(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  const byBlueprintTypeID = new Map(entries.map((e) => [e.blueprintTypeID, e]));
  return {
    entries,
    byBlueprintTypeID,
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: {},
  };
}

function owned(typeId: number, overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: typeId * 10,
    type_id: typeId,
    quantity: 1,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    ...overrides,
  };
}

describe('buildOpportunityCandidates', () => {
  it('excludes reaction blueprints', () => {
    const cat = catalog([catalogEntry(1, 'manufacturing'), catalogEntry(2, 'reaction')]);
    const candidates = buildOpportunityCandidates(
      new Map([[100, [owned(1), owned(2)]]]),
      new Map([[100, 'Pilot']]),
      cat
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.catalogEntry.blueprintTypeID).toBe(1);
  });

  it('excludes an owned blueprint the SDE catalog does not recognise', () => {
    const cat = catalog([catalogEntry(1)]);
    const candidates = buildOpportunityCandidates(
      new Map([[100, [owned(1), owned(999)]]]),
      new Map([[100, 'Pilot']]),
      cat
    );
    expect(candidates.map((c) => c.catalogEntry.blueprintTypeID)).toEqual([1]);
  });

  it('gives each owned blueprint entity its own candidate id, across characters', () => {
    const cat = catalog([catalogEntry(1)]);
    const candidates = buildOpportunityCandidates(
      new Map([
        [100, [owned(1, { item_id: 5 })]],
        [200, [owned(1, { item_id: 5 })]],
      ]),
      new Map([
        [100, 'Alpha'],
        [200, 'Bravo'],
      ]),
      cat
    );
    expect(new Set(candidates.map((c) => c.id)).size).toBe(2);
  });
});

describe('opportunitiesCacheKey', () => {
  function candidate(id: string): OpportunityCandidate {
    return {
      id,
      characterId: 1,
      characterName: 'Pilot',
      blueprint: owned(1),
      catalogEntry: catalogEntry(1),
    };
  }

  it('is independent of array order', () => {
    const a = opportunitiesCacheKey([candidate('b'), candidate('a')], DEFAULT_TRADE_HUB);
    const b = opportunitiesCacheKey([candidate('a'), candidate('b')], DEFAULT_TRADE_HUB);
    expect(a).toBe(b);
  });

  it('changes when the hub changes', () => {
    const jita = opportunitiesCacheKey([candidate('a')], DEFAULT_TRADE_HUB);
    const amarr = opportunitiesCacheKey([candidate('a')], { ...DEFAULT_TRADE_HUB, id: 'amarr' });
    expect(jita).not.toBe(amarr);
  });
});

describe('autoRecalculates', () => {
  it('is true at or below 10, false above', () => {
    expect(autoRecalculates(10)).toBe(true);
    expect(autoRecalculates(11)).toBe(false);
  });
});

describe('rankOpportunityRows', () => {
  function buildResult(overrides: Partial<BuildResult> = {}): BuildResult {
    return {
      materials: [],
      seconds: 3600,
      jobFee: { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 0 },
      materialCost: 0,
      totalCost: 1_000_000,
      buyCost: null,
      revenue: null,
      salesTax: null,
      brokerFee: null,
      netRevenue: null,
      profit: null,
      marginPct: null,
      iskPerHour: null,
      grossProfit: null,
      grossMargin: null,
      grossIskPerHour: null,
      breakEvenPrice: null,
      unpricedMaterials: [],
      unpriceable: false,
      recommendation: 'unknown',
      ...overrides,
    };
  }

  function row(id: string, iskPerHour: number | null): UnrankedOpportunityRow {
    return {
      candidate: {
        id,
        characterId: 1,
        characterName: 'Pilot',
        blueprint: owned(1),
        catalogEntry: catalogEntry(1),
      },
      result: buildResult({ iskPerHour, totalCost: 1_000_000 }),
      sellDepthIsk: 3_000_000,
      materialSourcing: {},
    };
  }

  it('sorts by ISK/hour descending and attaches order depth', () => {
    const ranked = rankOpportunityRows([row('low', 1), row('high', 3)]);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['high', 'low']);
    expect(ranked[0]!.orderDepth).toBe('deep');
  });
});
