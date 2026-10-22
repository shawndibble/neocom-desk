import { describe, expect, it } from 'vitest';
import { corpAssetTabFromPath, corpAssetTabPath, tabForState } from './corpAssetsTabs';

describe('corp assets tabs', () => {
  it('reads the bare path as All and each segment as its tab', () => {
    expect(corpAssetTabFromPath('')).toBe('all');
    expect(corpAssetTabFromPath('offices')).toBe('offices');
    expect(corpAssetTabFromPath('in-space/')).toBe('inSpace');
    expect(corpAssetTabFromPath('safety')).toBe('assetSafety');
    expect(corpAssetTabFromPath('capsuleer-deliveries')).toBe('capsuleerDeliveries');
  });

  it('reads an old tree path or an unknown segment as no tab', () => {
    expect(corpAssetTabFromPath('1/i:999')).toBeNull();
    expect(corpAssetTabFromPath('3')).toBeNull();
    expect(corpAssetTabFromPath('other')).toBeNull();
  });

  it('round-trips every tab through its path', () => {
    for (const tab of [
      'all',
      'offices',
      'deliveries',
      'inSpace',
      'impounded',
      'assetSafety',
      'lockdown',
      'capsuleerDeliveries',
    ] as const) {
      expect(
        corpAssetTabFromPath(corpAssetTabPath(tab).replace('/corp/assets', '').replace(/^\//, ''))
      ).toBe(tab);
    }
  });

  it('lists the fallback state under All', () => {
    expect(tabForState('other')).toBe('all');
    expect(tabForState('impounded')).toBe('impounded');
  });
});
