import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useAssetSort, ASSET_SORT_SETTING_KEY, DEFAULT_ASSET_SORT } from './assetSortPreference';

beforeEach(async () => {
  await db.settings.clear();
  useAssetSort.setState({ value: DEFAULT_ASSET_SORT, hydrated: false });
});

describe('useAssetSort', () => {
  it('defaults to name, unhydrated — the flat list order before this was persisted', () => {
    expect(useAssetSort.getState().value).toBe('name');
    expect(useAssetSort.getState().hydrated).toBe(false);
  });

  it('persists a choice to Dexie under the assetsItemSort key', async () => {
    await useAssetSort.getState().setValue('quantity');
    expect((await db.settings.get(ASSET_SORT_SETTING_KEY))?.value).toBe('quantity');
  });

  it('applies a persisted field on hydrate', async () => {
    await db.settings.put({ key: ASSET_SORT_SETTING_KEY, value: 'value' });
    await useAssetSort.getState().hydrate();
    expect(useAssetSort.getState().value).toBe('value');
  });

  /**
   * The station list sorts by fields this one does not offer. A stored
   * 'jumpsAway' is a plausible string that would leave the Select showing
   * nothing, so it has to fail the check rather than pass the typeof default.
   */
  it('falls back to the default for a field this list does not offer', async () => {
    await db.settings.put({ key: ASSET_SORT_SETTING_KEY, value: 'jumpsAway' });
    await useAssetSort.getState().hydrate();
    expect(useAssetSort.getState().value).toBe(DEFAULT_ASSET_SORT);
  });

  it('falls back to the default when the stored value is not a string at all', async () => {
    await db.settings.put({ key: ASSET_SORT_SETTING_KEY, value: { field: 'value' } });
    await useAssetSort.getState().hydrate();
    expect(useAssetSort.getState().value).toBe(DEFAULT_ASSET_SORT);
  });
});
