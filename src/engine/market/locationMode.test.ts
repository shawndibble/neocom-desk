import { describe, it, expect } from 'vitest';
import { regionsForSystems, resolveOrderBookRegion } from './locationMode';

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

describe('regionsForSystems', () => {
  const DOMAIN_REGION_ID = 10000043;
  const systemsById = new Map([
    [30000142, { regionId: THE_FORGE_REGION_ID }], // Jita
    [30000144, { regionId: THE_FORGE_REGION_ID }], // Perimeter
    [30002187, { regionId: DOMAIN_REGION_ID }], // Amarr
  ]);

  it('returns each region that holds at least one allowed system, once', () => {
    expect(regionsForSystems(new Set([30000142, 30000144, 30002187]), systemsById)).toEqual(
      new Set([THE_FORGE_REGION_ID, DOMAIN_REGION_ID])
    );
  });

  it('leaves out regions none of whose systems are allowed', () => {
    expect(regionsForSystems(new Set([30000142]), systemsById)).toEqual(
      new Set([THE_FORGE_REGION_ID])
    );
  });

  it('skips a system the lookup does not know rather than guessing its region', () => {
    expect(regionsForSystems(new Set([31000005]), systemsById)).toEqual(new Set());
  });
});
