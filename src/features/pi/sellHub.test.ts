import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import { db } from '@/db';
import { usePageHubs } from '@/features/market/pageHubs';
import { resetHubStores } from '@/test/hubStores';
import { DEFAULT_PI_SETTINGS, PI_SETTINGS_KEY, usePiSettings } from './piSettings';
import { migratePiHub, PI_HUB_MIGRATED_KEY } from './sellHub';

beforeEach(async () => {
  await db.settings.clear();
  resetHubStores();
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
});

describe('migratePiHub', () => {
  it("makes a hub picked on this device PI's own hub, once, and keeps the old row", async () => {
    await db.settings.put({
      key: PI_SETTINGS_KEY,
      value: { ...DEFAULT_PI_SETTINGS, hub: 'amarr', hubChosen: true },
    });
    await migratePiHub();
    expect(usePageHubs.getState().value).toEqual({ pi: 'amarr' });
    expect((await db.settings.get(PI_SETTINGS_KEY))?.value).toMatchObject({ hub: 'amarr' });

    // Back to Global later is never re-seeded.
    await usePageHubs.getState().setValue({});
    await migratePiHub();
    expect(usePageHubs.getState().value).toEqual({});
  });

  it('leaves PI on Global when the hub was never picked', async () => {
    await migratePiHub();
    expect(usePageHubs.getState().value).toEqual({});
    expect(await db.settings.get(PI_HUB_MIGRATED_KEY)).toBeDefined();
  });

  it('keeps an entry another device already set', async () => {
    await db.settings.bulkPut([
      { key: PI_SETTINGS_KEY, value: { ...DEFAULT_PI_SETTINGS, hub: 'amarr', hubChosen: true } },
      { key: 'sync.pageHubs', value: { pi: 'dodixie' } },
    ]);
    await migratePiHub();
    expect(usePageHubs.getState().value).toEqual({ pi: 'dodixie' });
  });
});
