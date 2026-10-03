import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkFitsCurrency,
  resetFitCurrencyCache,
  type CurrencyGameData,
} from './workbenchFitCurrency';

const data: CurrencyGameData = {
  typeByName: new Map([['vexor', { typeID: 626 }]]),
  slotByTypeId: {},
  hullSlots: () => ({ high: 4, medium: 4, low: 5, rig: 3 }),
};

function fits(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    eft: i % 2 === 0 ? `[Vexor, Fit ${i}]` : `[Vexor, Fit ${i}]\nOld Gun I`,
  }));
}

describe('checkFitsCurrency', () => {
  beforeEach(() => resetFitCurrencyCache());

  it('gives every fit a verdict', async () => {
    const verdicts = await checkFitsCurrency(fits(3), data);
    expect(verdicts?.get('0')).toEqual({ current: true });
    expect(verdicts?.get('1')).toEqual({
      current: false,
      reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
    });
  });

  it('hands the UI a turn between chunks of a long list', async () => {
    const yieldToUi = vi.fn(() => Promise.resolve());
    const verdicts = await checkFitsCurrency(fits(300), data, () => false, yieldToUi);
    expect(verdicts?.size).toBe(300);
    expect(yieldToUi).toHaveBeenCalledTimes(11); // 12 chunks of 25
  });

  it('stops when cancelled part way', async () => {
    let cancelled = false;
    const yieldToUi = vi.fn(() => {
      cancelled = true;
      return Promise.resolve();
    });
    expect(await checkFitsCurrency(fits(60), data, () => cancelled, yieldToUi)).toBeNull();
  });

  it('re-checks a fit whose EFT changed', async () => {
    await checkFitsCurrency([{ id: 'x', eft: '[Vexor, X]\nOld Gun I' }], data);
    const verdicts = await checkFitsCurrency([{ id: 'x', eft: '[Vexor, X]' }], data);
    expect(verdicts?.get('x')).toEqual({ current: true });
  });
});
