import { describe, expect, it } from 'vitest';
import { classifyCorpAssets } from '@/engine/corp/assetLedger';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import { countShortTypes, summariseCorpAssets } from './corpAssetsSummary';

const asset = (itemId: number, typeId: number, flag: string, over = {}): CorpAssetInput => ({
  itemId,
  typeId,
  quantity: 1,
  locationId: 60003760,
  locationType: 'station',
  locationFlag: flag,
  ...over,
});

const prices = new Map([
  [34, 10],
  [587, 1000],
]);

describe('summariseCorpAssets', () => {
  it('counts stacks and values the recovery states, and the usable stock per type', () => {
    const office = asset(1, 27, 'OfficeFolder');
    const inputs: CorpAssetInput[] = [
      office,
      asset(2, 34, 'CorpSAG1', { locationId: 1, quantity: 100 }),
      asset(3, 34, 'CorpDeliveries', { quantity: 50 }),
      asset(4, 587, 'AssetSafety'),
      asset(5, 587, 'AssetSafety', { quantity: 2 }),
      asset(6, 34, 'Impounded', { quantity: 7 }),
      asset(7, 587, 'CorpSAG2', { locationId: 1, isBlueprintCopy: true }),
    ];
    const s = summariseCorpAssets(classifyCorpAssets(inputs).items, { prices });
    expect(s.assetSafety).toEqual({ stacks: 2, value: 3000 });
    expect(s.impounded).toEqual({ stacks: 1, value: 70 });
    expect(s.deliveries).toEqual({ stacks: 1 });
    expect(s.totalStacks).toBe(6);
    expect(s.usableByType.get(34)).toBe(150);
    expect(s.usableByType.has(587)).toBe(false);
  });

  it('leaves values unknown when no prices could be read', () => {
    const inputs = [asset(4, 587, 'AssetSafety')];
    const s = summariseCorpAssets(classifyCorpAssets(inputs).items, { prices: new Map() });
    expect(s.assetSafety).toEqual({ stacks: 1, value: null });
  });

  it('is all zero for an empty corporation', () => {
    const s = summariseCorpAssets([], { prices });
    expect(s.totalStacks).toBe(0);
    expect(s.assetSafety).toEqual({ stacks: 0, value: 0 });
    expect(s.usableByType.size).toBe(0);
  });
});

describe('countShortTypes', () => {
  it('counts types short or with none owned, not met ones', () => {
    const owned = new Map([
      [34, 150],
      [35, 5],
    ]);
    const targets = new Map([
      [34, 100],
      [35, 10],
      [36, 1],
    ]);
    expect(countShortTypes(targets, owned)).toBe(2);
    expect(countShortTypes(new Map(), owned)).toBe(0);
  });
});
