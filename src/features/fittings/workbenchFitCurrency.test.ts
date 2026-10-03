import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkFitsCurrency,
  resetFitCurrencyCache,
  type CurrencyGameData,
} from './workbenchFitCurrency';

const data: CurrencyGameData = {
  typeByName: new Map([
    ['vexor', { typeID: 626 }],
    ['heavy neutron blaster ii', { typeID: 3001 }],
    ['damage control ii', { typeID: 2048 }],
  ]),
  slotByTypeId: { 3001: 'high', 2048: 'low' },
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
    const checks = await checkFitsCurrency(fits(3), data);
    expect(checks?.get('0')?.verdict).toEqual({ current: true });
    expect(checks?.get('1')?.verdict).toEqual({
      current: false,
      reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
    });
  });

  it('keeps the modules the same pass loaded, rack and type only', async () => {
    const checks = await checkFitsCurrency(
      [{ id: 'a', eft: '[Vexor, A]\nDamage Control II\n\nHeavy Neutron Blaster II' }],
      data
    );
    expect(checks?.get('a')?.modules).toEqual([
      { slot: 'high', typeId: 3001 },
      { slot: 'low', typeId: 2048 },
    ]);
  });

  it('keeps what did load on an out-of-date fit, leaving out the line it could not read', async () => {
    const checks = await checkFitsCurrency(
      [{ id: 'a', eft: '[Vexor, A]\nOld Gun I\nHeavy Neutron Blaster II' }],
      data
    );
    expect(checks?.get('a')?.verdict.current).toBe(false);
    expect(checks?.get('a')?.modules).toEqual([{ slot: 'high', typeId: 3001 }]);
  });

  it('has no modules for a hull the game no longer knows', async () => {
    const checks = await checkFitsCurrency([{ id: 'a', eft: '[Gone Hull, A]' }], data);
    expect(checks?.get('a')?.modules).toEqual([]);
  });

  it('parses each EFT once, answering a repeat from the cache', async () => {
    const lookup = vi.fn((name: string) => data.typeByName.get(name));
    const counted = { ...data, typeByName: { get: lookup } };
    const fit = { id: 'a', eft: '[Vexor, A]\nHeavy Neutron Blaster II' };
    await checkFitsCurrency([fit], counted);
    const calls = lookup.mock.calls.length;
    const again = await checkFitsCurrency([fit], counted);
    expect(lookup.mock.calls.length).toBe(calls);
    expect(again?.get('a')?.modules).toEqual([{ slot: 'high', typeId: 3001 }]);
  });

  it('hands the UI a turn between chunks of a long list', async () => {
    const yieldToUi = vi.fn(() => Promise.resolve());
    const checks = await checkFitsCurrency(fits(300), data, () => false, yieldToUi);
    expect(checks?.size).toBe(300);
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
    const checks = await checkFitsCurrency([{ id: 'x', eft: '[Vexor, X]' }], data);
    expect(checks?.get('x')?.verdict).toEqual({ current: true });
  });
});
