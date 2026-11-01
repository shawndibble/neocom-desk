import { describe, it, expect } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { appraisalShareViewFromSnapshot, itemsWithMyRefine } from './appraisalShareData';

describe('appraisalShareViewFromSnapshot', () => {
  const snapshot: AppraisalSnapshot = {
    v: 1,
    hub: 'amarr',
    pricePercent: 90,
    generatedAt: 1_790_000_000,
    items: [{ typeId: 34, name: 'Tritanium', quantity: 100, buy: 5, sell: 6, unitVolume: 0.01 }],
  };

  it('rebuilds the appraisal at the prices it was shared with — no live repricing', () => {
    const result = appraisalShareViewFromSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hub).toBe(getTradeHub('amarr'));
    expect(result.value.pricePercent).toBe(90);
    expect(result.value.generatedAt).toBe(1_790_000_000);
    expect(result.value.appraisal.totals).toMatchObject({ buy: 450, sell: 540 });
  });

  it('rejects a hub id that names no real Trade Hub', () => {
    expect(appraisalShareViewFromSnapshot({ ...snapshot, hub: 'not-a-hub' })).toEqual({
      ok: false,
      reason: 'unknown-hub',
    });
  });
});

describe('a shared appraisal that carries refine figures', () => {
  const snapshot: AppraisalSnapshot = {
    v: 1,
    hub: 'jita',
    pricePercent: 90,
    generatedAt: 1_790_000_000,
    items: [
      {
        typeId: 1,
        name: 'Zeolites',
        quantity: 1000,
        buy: 1000,
        sell: 1200,
        unitVolume: 10,
        refine: {
          portionSize: 100,
          materials: [{ typeId: 35, quantity: 16_000 }],
          efficiency: 0.9,
        },
      },
    ],
    refine: {
      yieldRate: 0.66,
      taxRate: 0,
      minerals: [{ typeId: 35, name: 'Pyerite', price: 10 }],
    },
  };

  it("shows the sharer's refine figure, the setup behind it and the mineral names", () => {
    const result = appraisalShareViewFromSnapshot(snapshot);
    if (!result.ok) throw new Error('view');
    const { value } = result;
    // 10 portions x floor(16,000 x 0.9) Pyerite x 10 ISK, at 90%
    expect(value.appraisal.rows[0].refineTotal).toBeCloseTo(10 * 14_400 * 10 * 0.9, 6);
    expect(value.refining).toEqual({ yieldRate: 0.66, taxRate: 0 });
    expect(value.mineralNames.get(35)).toBe('Pyerite');
  });

  it('has no refining setup for an older link without one', () => {
    const old = structuredClone(snapshot);
    delete old.refine;
    for (const item of old.items) delete item.refine;
    const result = appraisalShareViewFromSnapshot(old);
    if (!result.ok) throw new Error('view');
    expect(result.value.refining).toBeNull();
    expect(result.value.appraisal.rows[0].refineTotal).toBeUndefined();
  });

  it("re-refines at the visitor's own setup and skills, at the shared prices", () => {
    const result = appraisalShareViewFromSnapshot(snapshot);
    if (!result.ok) throw new Error('view');
    const mine = itemsWithMyRefine(result.value, {
      reprocessing: {
        '1': { portionSize: 100, materials: [{ typeID: 35, quantity: 16_000 }] },
      },
      modifiers: NO_CHARACTER_MODIFIERS,
      refining: { stationRate: 0.5, taxRate: 0.1 },
    });
    // Scrap-free fixture: no specialisation skill, so only the facility rate applies.
    expect(mine[0].refine?.detail?.efficiency).toBe(0.5);
    expect(mine[0].refine?.valueAtFullPrice).toBeCloseTo(10 * 8000 * 10 * 0.9, 6);
  });

  it('leaves an item the visitor has no reprocessing data for without a refine figure', () => {
    const result = appraisalShareViewFromSnapshot(snapshot);
    if (!result.ok) throw new Error('view');
    const mine = itemsWithMyRefine(result.value, {
      reprocessing: {},
      modifiers: NO_CHARACTER_MODIFIERS,
      refining: { stationRate: 0.5, taxRate: 0 },
    });
    expect(mine[0].refine).toBeUndefined();
  });
});
