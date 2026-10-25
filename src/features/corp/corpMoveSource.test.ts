import { describe, expect, it } from 'vitest';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import { corpMoveAssets } from './corpMoveSource';

const JITA = 60003760;
const STRUCTURE = 1_000_000_000_001;

const input = (over: Partial<CorpAssetInput> & Pick<CorpAssetInput, 'itemId'>): CorpAssetInput => ({
  typeId: 34,
  quantity: 10,
  locationId: 9000,
  locationType: 'item',
  locationFlag: 'CorpSAG1',
  isSingleton: false,
  ...over,
});

const officeAt = (itemId: number, locationId: number, locationType: 'station' | 'other') =>
  input({ itemId, typeId: 27, locationId, locationType, locationFlag: 'OfficeFolder' });

describe('corpMoveAssets', () => {
  it('lifts a hangar item to its office station as plain hangar stock', () => {
    const out = corpMoveAssets([officeAt(9000, JITA, 'station'), input({ itemId: 1 })]);
    expect(out).toEqual([
      {
        item_id: 1,
        type_id: 34,
        quantity: 10,
        location_id: JITA,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: false,
      },
    ]);
  });

  it('keeps a structure office as a structure pickup', () => {
    const out = corpMoveAssets([
      officeAt(9000, STRUCTURE, 'other'),
      input({ itemId: 1, locationFlag: 'CorpSAG7' }),
    ]);
    expect(out).toMatchObject([{ location_id: STRUCTURE, location_type: 'other' }]);
  });

  it('keeps an assembled ship so it can be flown out', () => {
    const out = corpMoveAssets([
      officeAt(9000, JITA, 'station'),
      input({ itemId: 2, typeId: 648, quantity: 1, isSingleton: true }),
    ]);
    expect(out).toMatchObject([{ item_id: 2, is_singleton: true }]);
  });

  it('drops everything that is not top-level division stock at a station or structure', () => {
    const out = corpMoveAssets([
      officeAt(9000, JITA, 'station'),
      input({ itemId: 1, locationFlag: 'CorpDeliveries' }),
      input({ itemId: 2, locationFlag: 'Impounded' }),
      input({ itemId: 3, locationFlag: 'AssetSafety' }),
      input({
        itemId: 4,
        locationId: JITA,
        locationType: 'solar_system',
        locationFlag: 'Unlocked',
      }),
      // in a container that sits in the office
      input({ itemId: 5, locationId: 50, locationFlag: 'Unlocked' }),
      input({ itemId: 50, typeId: 3293, quantity: 1, isSingleton: true }),
    ]);
    expect(out.map((a) => a.item_id)).toEqual([50]);
  });

  it('carries rigs fitted to a kept ship, for the rig count, and no other nested item', () => {
    const out = corpMoveAssets([
      officeAt(9000, JITA, 'station'),
      input({ itemId: 2, typeId: 648, quantity: 1, isSingleton: true }),
      input({ itemId: 3, locationId: 2, locationFlag: 'RigSlot0' }),
      input({ itemId: 4, locationId: 2, locationFlag: 'HiSlot0' }),
      input({ itemId: 5, locationId: 777, locationFlag: 'RigSlot0' }),
    ]);
    expect(out.map((a) => a.item_id)).toEqual([2, 3]);
    expect(out[1]).toMatchObject({ location_type: 'item', location_flag: 'RigSlot0' });
  });
});
