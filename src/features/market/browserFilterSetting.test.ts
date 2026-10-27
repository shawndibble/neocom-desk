import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useBrowserFilterSetting,
  BROWSER_FILTER_SETTING_KEY,
  DEFAULT_BROWSER_FILTER_SETTING,
} from './browserFilterSetting';

beforeEach(async () => {
  await db.settings.clear();
  useBrowserFilterSetting.setState({ value: DEFAULT_BROWSER_FILTER_SETTING, hydrated: false });
});

describe('useBrowserFilterSetting', () => {
  it('defaults to the widest filter bar, unhydrated', () => {
    expect(useBrowserFilterSetting.getState().value).toEqual(DEFAULT_BROWSER_FILTER_SETTING);
    expect(useBrowserFilterSetting.getState().hydrated).toBe(false);
  });

  it('persists a jump range + security + NPC-only choice to Dexie under the marketBrowserFilters key', async () => {
    const value = {
      jumps: '15' as const,
      sec: new Set(['highsec', 'lowsec'] as const),
      minQty: 10,
      npcOnly: true,
      hideBait: true,
    };
    await useBrowserFilterSetting.getState().setValue(value);
    expect((await db.settings.get(BROWSER_FILTER_SETTING_KEY))?.value).toEqual(value);
  });

  it('applies a persisted value on hydrate', async () => {
    const value = {
      jumps: '5' as const,
      sec: new Set(['nullsec'] as const),
      minQty: 100,
      npcOnly: false,
      hideBait: true,
    };
    await db.settings.put({ key: BROWSER_FILTER_SETTING_KEY, value });
    await useBrowserFilterSetting.getState().hydrate();
    expect(useBrowserFilterSetting.getState().value).toEqual(value);
  });

  it('reads a value stored before Hide bait sells existed as bait shown, keeping its other filters', async () => {
    const value = {
      jumps: '5' as const,
      sec: new Set(['nullsec'] as const),
      minQty: 100,
      npcOnly: true,
    };
    await db.settings.put({ key: BROWSER_FILTER_SETTING_KEY, value });
    await useBrowserFilterSetting.getState().hydrate();
    expect(useBrowserFilterSetting.getState().value).toEqual({ ...value, hideBait: false });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({
      key: BROWSER_FILTER_SETTING_KEY,
      value: { jumps: 'bogus', sec: [], minQty: -1, npcOnly: 'yes' },
    });
    await useBrowserFilterSetting.getState().hydrate();
    expect(useBrowserFilterSetting.getState().value).toEqual(DEFAULT_BROWSER_FILTER_SETTING);
  });

  it('falls back to the default when sec is a plain array instead of a Set', async () => {
    await db.settings.put({
      key: BROWSER_FILTER_SETTING_KEY,
      value: { jumps: 'any', sec: ['highsec'], minQty: 0, npcOnly: false },
    });
    await useBrowserFilterSetting.getState().hydrate();
    expect(useBrowserFilterSetting.getState().value).toEqual(DEFAULT_BROWSER_FILTER_SETTING);
  });
});
