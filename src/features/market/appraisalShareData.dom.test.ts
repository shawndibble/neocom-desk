import { describe, it, expect } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { appraisalShareViewFromSnapshot } from './appraisalShareData';

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
