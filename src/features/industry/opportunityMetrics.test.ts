import { describe, expect, it } from 'vitest';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { OpportunityRow } from './opportunities';
import { unitCount, unitMargin } from './opportunityMetrics';

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
