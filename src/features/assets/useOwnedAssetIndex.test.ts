import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { loadOwnedAssetIndex } from './useOwnedAssetIndex';

function asset(typeId: number, locationId: number) {
  return {
    item_id: typeId,
    type_id: typeId,
    quantity: 1,
    location_id: locationId,
    location_type: 'station',
    location_flag: 'Hangar',
  };
}

afterEach(async () => {
  await db.esiCache.clear();
  await db.characters.clear();
});

describe('loadOwnedAssetIndex', () => {
  it('reuses one index until the cached assets are rewritten', async () => {
    await db.characters.put({ characterId: 7, name: 'Hauler', ownerHash: 'h', addedAt: 1 });
    await db.esiCache.put({
      characterId: 7,
      key: 'assets',
      value: [asset(587, 60003760)],
      fetchedAt: 1,
    });

    const first = await loadOwnedAssetIndex();
    expect(first.typeIds.has(587)).toBe(true);
    expect(first.placeIds.has(60003760)).toBe(true);
    expect(await loadOwnedAssetIndex()).toBe(first);

    await db.esiCache.put({
      characterId: 7,
      key: 'assets',
      value: [asset(588, 60008494)],
      fetchedAt: 2,
    });
    const next = await loadOwnedAssetIndex();
    expect(next.typeIds.has(587)).toBe(false);
    expect(next.placeIds.has(60008494)).toBe(true);
  });
});
