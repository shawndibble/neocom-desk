import { describe, it, expect } from 'vitest';
import { resolveOrderBookRegion } from './locationMode';

const PLEX_TYPE_ID = 44992;
const RIFTER_TYPE_ID = 587;
const GPMR_01_REGION_ID = 19000001;
const THE_FORGE_REGION_ID = 10000002;

describe('resolveOrderBookRegion', () => {
  it('reads an ordinary item from whatever region the caller chose', () => {
    const globalMarkets = new Map();
    const result = resolveOrderBookRegion(RIFTER_TYPE_ID, THE_FORGE_REGION_ID, globalMarkets);
    expect(result).toEqual({ regionId: THE_FORGE_REGION_ID, override: null });
  });

  it('routes a globally-traded item to its Global Market Region regardless of the chosen region', () => {
    const globalMarkets = new Map([
      [PLEX_TYPE_ID, { regionId: GPMR_01_REGION_ID, regionName: 'GPMR-01' }],
    ]);
    const result = resolveOrderBookRegion(PLEX_TYPE_ID, THE_FORGE_REGION_ID, globalMarkets);
    expect(result).toEqual({
      regionId: GPMR_01_REGION_ID,
      override: { regionId: GPMR_01_REGION_ID, regionName: 'GPMR-01' },
    });
  });
});
