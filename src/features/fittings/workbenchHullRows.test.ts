import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameItemLookup } from '@/engine/fittings/fitCurrency';
import type { WorkbenchGameData } from '@/engine/fittings/workbenchFitCheck';
import {
  checkWorkbenchFits,
  resetWorkbenchCheckCache,
  workbenchGameDataLoader,
  type WorkbenchSde,
} from './workbenchHullRows';

const data: WorkbenchGameData = {
  typeByName: new Map([
    ['vexor', { typeID: 626 }],
    ['heavy neutron blaster ii', { typeID: 3001 }],
  ]),
  slotByTypeId: { 3001: 'high' },
  hullSlots: () => ({ high: 4, medium: 4, low: 5, rig: 3 }),
  isGameItem: gameItemLookup(['Vexor', 'Heavy Neutron Blaster II']),
};

function fits(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    eft: i % 2 === 0 ? `[Vexor, Fit ${i}]` : `[Vexor, Fit ${i}]\nOld Gun I`,
  }));
}

describe('checkWorkbenchFits', () => {
  beforeEach(() => resetWorkbenchCheckCache());

  it('gives every fit a check', async () => {
    const checks = await checkWorkbenchFits(fits(3), data);
    expect(checks?.get('0')?.verdict).toEqual({ current: true });
    expect(checks?.get('1')?.verdict).toEqual({
      current: false,
      reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
    });
  });

  it('parses each EFT once, answering a repeat from the cache', async () => {
    const lookup = vi.fn((name: string) => data.typeByName.get(name));
    const counted = { ...data, typeByName: { get: lookup } };
    const fit = { id: 'a', eft: '[Vexor, A]\nHeavy Neutron Blaster II' };
    await checkWorkbenchFits([fit], counted);
    const calls = lookup.mock.calls.length;
    const again = await checkWorkbenchFits([fit], counted);
    expect(lookup.mock.calls.length).toBe(calls);
    expect(again?.get('a')?.modules).toEqual([{ slot: 'high', typeId: 3001 }]);
  });

  it('re-checks a fit whose EFT changed', async () => {
    await checkWorkbenchFits([{ id: 'x', eft: '[Vexor, X]\nOld Gun I' }], data);
    const checks = await checkWorkbenchFits([{ id: 'x', eft: '[Vexor, X]' }], data);
    expect(checks?.get('x')?.verdict).toEqual({ current: true });
  });

  it('hands the UI a turn between chunks of a long list', async () => {
    const yieldToUi = vi.fn(() => Promise.resolve());
    const checks = await checkWorkbenchFits(fits(300), data, () => false, yieldToUi);
    expect(checks?.size).toBe(300);
    expect(yieldToUi).toHaveBeenCalledTimes(11); // 12 chunks of 25
  });

  it('stops when cancelled part way', async () => {
    let cancelled = false;
    const yieldToUi = vi.fn(() => {
      cancelled = true;
      return Promise.resolve();
    });
    expect(await checkWorkbenchFits(fits(60), data, () => cancelled, yieldToUi)).toBeNull();
  });
});

describe('workbenchGameDataLoader', () => {
  function sde(overrides: Partial<WorkbenchSde> = {}): WorkbenchSde {
    return {
      itemNames: () => Promise.resolve(data.typeByName),
      fittingSlots: () => Promise.resolve(data.slotByTypeId),
      shipTree: () =>
        Promise.resolve({
          ships: [{ typeID: 626, stats: { highSlots: 1, medSlots: 4, lowSlots: 5, rigSlots: 3 } }],
        }),
      gameTypeNames: () => Promise.resolve(['Vexor', 'Fierce Exotic Filament']),
      ...overrides,
    };
  }

  it("reads each hull's slots and the game's names", async () => {
    const game = await workbenchGameDataLoader(sde())();
    expect(game.hullSlots(626)).toEqual({ high: 1, medium: 4, low: 5, rig: 3 });
    expect(game.hullSlots(627)).toBeNull();
    expect(game.isGameItem('fierce exotic filament')).toBe(true);
  });

  it('reads the files once, however often it is asked', async () => {
    const itemNames = vi.fn(() => Promise.resolve(data.typeByName));
    const load = workbenchGameDataLoader(sde({ itemNames }));
    await Promise.all([load(), load()]);
    await load();
    expect(itemNames).toHaveBeenCalledTimes(1);
  });

  it("without the game's names, calls nothing removed, and reads them again next time", async () => {
    const gameTypeNames = vi
      .fn<WorkbenchSde['gameTypeNames']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(['Vexor']);
    const load = workbenchGameDataLoader(sde({ gameTypeNames }));
    const game = await load();
    expect(game.isGameItem('Old Gun I')).toBe(true);
    expect(game.hullSlots(626)).not.toBeNull();
    expect((await load()).isGameItem('Old Gun I')).toBe(false);
  });

  it('fails without the catalogue, and tries again next time', async () => {
    const itemNames = vi
      .fn<WorkbenchSde['itemNames']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(data.typeByName);
    const load = workbenchGameDataLoader(sde({ itemNames }));
    await expect(load()).rejects.toThrow('offline');
    expect((await load()).typeByName).toBe(data.typeByName);
  });
});
