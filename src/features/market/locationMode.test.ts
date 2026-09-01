import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useLocationMode, LOCATION_MODE_SETTING_KEY, DEFAULT_LOCATION_MODE } from './locationMode';

beforeEach(async () => {
  await db.settings.clear();
  useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
});

describe('useLocationMode', () => {
  it('defaults to Trade Hub mode with no region selected, unhydrated', () => {
    expect(useLocationMode.getState().value).toEqual(DEFAULT_LOCATION_MODE);
    expect(useLocationMode.getState().hydrated).toBe(false);
  });

  it('persists a Region-mode choice to Dexie under the marketLocationMode key', async () => {
    await useLocationMode.getState().setValue({ mode: 'region', regionId: 10000002 });
    expect((await db.settings.get(LOCATION_MODE_SETTING_KEY))?.value).toEqual({
      mode: 'region',
      regionId: 10000002,
    });
  });

  it('applies a persisted value on hydrate', async () => {
    await db.settings.put({
      key: LOCATION_MODE_SETTING_KEY,
      value: { mode: 'region', regionId: 10000043 },
    });
    await useLocationMode.getState().hydrate();
    expect(useLocationMode.getState().value).toEqual({ mode: 'region', regionId: 10000043 });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: LOCATION_MODE_SETTING_KEY, value: { mode: 'bogus' } });
    await useLocationMode.getState().hydrate();
    expect(useLocationMode.getState().value).toEqual(DEFAULT_LOCATION_MODE);
  });
});
