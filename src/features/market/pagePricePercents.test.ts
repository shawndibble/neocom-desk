import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { resetHubStores } from '@/test/hubStores';
import { DEFAULT_PI_SETTINGS, usePiSettings } from '@/features/pi/piSettings';
import {
  atPercent,
  loadPricePercentFor,
  parsePagePricePercents,
  percentFrom,
  setPricePercentFor,
  usePagePricePercents,
} from './pagePricePercents';
import { useMarketPricePercent } from './pricePercent';

describe('percentFrom', () => {
  it('is 100 for a page with no entry, and the entry when there is one', () => {
    expect(percentFrom('fittings', {}, 100, null)).toBe(100);
    expect(percentFrom('fittings', { fittings: 95 }, 100, null)).toBe(95);
  });

  it('reads Appraisal from its own Price %', () => {
    expect(percentFrom('appraisal', { appraisal: 50 }, 80, null)).toBe(80);
  });

  it('reads PI from its buyback rate until PI has an entry', () => {
    expect(percentFrom('pi', {}, 100, 85)).toBe(85);
    expect(percentFrom('pi', { pi: 100 }, 100, 85)).toBe(100);
  });
});

describe('parsePagePricePercents', () => {
  it('keeps valid entries, an unknown area’s too, and drops the rest', () => {
    expect(parsePagePricePercents({ fittings: 90, future: 80, bad: 'x', huge: 5000 })).toEqual({
      fittings: 90,
      future: 80,
    });
    expect(parsePagePricePercents([])).toBeNull();
  });
});

describe('setPricePercentFor', () => {
  beforeEach(async () => {
    await db.settings.clear();
    resetHubStores();
  });

  it('writes a page’s entry and leaves the others', async () => {
    await usePagePricePercents.getState().setValue({ mining: 95 });
    await setPricePercentFor('fittings', 90);
    expect(usePagePricePercents.getState().value).toEqual({ mining: 95, fittings: 90 });
    expect(await loadPricePercentFor('fittings')).toBe(90);
  });

  it('writes Appraisal to its Price %', async () => {
    await setPricePercentFor('appraisal', 70);
    expect(useMarketPricePercent.getState().value).toBe(70);
    expect(usePagePricePercents.getState().value).toEqual({});
  });

  it('also writes PI’s buyback, which older builds read, 100 as none', async () => {
    await usePiSettings.getState().setValue({ ...DEFAULT_PI_SETTINGS, buybackPct: 85 });
    await setPricePercentFor('pi', 90);
    expect(usePiSettings.getState().value.buybackPct).toBe(90);
    await setPricePercentFor('pi', 100);
    expect(usePiSettings.getState().value.buybackPct).toBeNull();
    expect(usePagePricePercents.getState().value).toEqual({ pi: 100 });
  });

  it('ignores a value out of range', async () => {
    await setPricePercentFor('fittings', -5);
    expect(usePagePricePercents.getState().value).toEqual({});
  });
});

describe('atPercent', () => {
  it('scales a price, and 100 leaves it exact', () => {
    expect(atPercent(200, 90)).toBe(180);
    expect(atPercent(0.1 + 0.2, 100)).toBe(0.1 + 0.2);
  });
});
