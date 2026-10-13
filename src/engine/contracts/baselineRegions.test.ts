import { describe, expect, it } from 'vitest';
import { THE_FORGE_REGION_ID, baselineRegions, nearestHub } from './baselineRegions';

const FORGE = THE_FORGE_REGION_ID;
const DOMAIN = 10000043;
const HEIMATAR = 10000030;
const SINQ = 10000032;

describe('baselineRegions', () => {
  const base = { hubRegionId: null, nearestHubRegionId: null, currentRegionId: null };

  it('always leads with The Forge, the pricing baseline, even with nothing else known', () => {
    expect(baselineRegions(base)).toEqual([{ regionId: FORGE, reasons: ['forge'] }]);
  });

  it('adds the market hub, the nearest hub and then the current region, in that order', () => {
    expect(
      baselineRegions({ hubRegionId: DOMAIN, nearestHubRegionId: HEIMATAR, currentRegionId: null })
    ).toEqual([
      { regionId: FORGE, reasons: ['forge'] },
      { regionId: DOMAIN, reasons: ['hub'] },
      { regionId: HEIMATAR, reasons: ['nearest'] },
    ]);
  });

  it('never shows more than three: a fourth distinct region is dropped', () => {
    const regions = baselineRegions({
      hubRegionId: DOMAIN,
      nearestHubRegionId: HEIMATAR,
      currentRegionId: SINQ,
    });
    expect(regions.map((r) => r.regionId)).toEqual([FORGE, DOMAIN, HEIMATAR]);
  });

  it('gives the freed slot to the current region when two of the others coincide', () => {
    expect(
      baselineRegions({ hubRegionId: FORGE, nearestHubRegionId: DOMAIN, currentRegionId: SINQ })
    ).toEqual([
      { regionId: FORGE, reasons: ['forge', 'hub'] },
      { regionId: DOMAIN, reasons: ['nearest'] },
      { regionId: SINQ, reasons: ['here'] },
    ]);
  });

  it('folds a region that is several of these into one entry naming every reason, down to one', () => {
    expect(
      baselineRegions({ hubRegionId: FORGE, nearestHubRegionId: FORGE, currentRegionId: FORGE })
    ).toEqual([{ regionId: FORGE, reasons: ['forge', 'hub', 'nearest', 'here'] }]);
  });
});

describe('nearestHub', () => {
  const hubs = [
    { id: 'jita', systemId: 1, regionId: FORGE },
    { id: 'amarr', systemId: 2, regionId: DOMAIN },
    { id: 'rens', systemId: 3, regionId: HEIMATAR },
  ];

  it('is the hub fewest jumps away', () => {
    const jumps = new Map([
      [1, 14],
      [2, 3],
      [3, 9],
    ]);
    expect(nearestHub(hubs, jumps)?.id).toBe('amarr');
  });

  it('breaks a tie by the list order', () => {
    const jumps = new Map([
      [1, 5],
      [2, 5],
    ]);
    expect(nearestHub(hubs, jumps)?.id).toBe('jita');
  });

  it('skips a hub the stargate graph cannot reach', () => {
    expect(nearestHub(hubs, new Map([[3, 20]]))?.id).toBe('rens');
  });

  it('is null with no distances, or none to any hub', () => {
    expect(nearestHub(hubs, null)).toBeNull();
    expect(nearestHub(hubs, new Map([[99, 1]]))).toBeNull();
  });
});
