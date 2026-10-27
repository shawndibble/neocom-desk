import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: () =>
    Promise.resolve({
      // The slim snapshot carries only the assembled volume of a hull.
      '47466': { name: 'Praxis', groupID: 27, volume: 470_000 },
      '99999': { name: 'Odd ship', groupID: 27, volume: 470_000 },
      '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
    }),
}));
vi.mock('@/sde/marketTypesById', () => ({
  loadMarketTypesById: () =>
    Promise.resolve(
      new Map([
        [
          47466,
          {
            typeId: 47466,
            name: 'Praxis',
            marketGroupId: 1,
            volume: 470_000,
            packagedVolume: 50_000,
          },
        ],
      ])
    ),
}));

const { loadTypePackagedVolumes } = await import('./typeNames');

describe('loadTypePackagedVolumes', () => {
  it('reads a hull packaged volume from the market catalogue, not the assembled volume', async () => {
    const volumes = await loadTypePackagedVolumes([47466, 34], new Set([47466]));
    expect(volumes.get(47466)).toBe(50_000);
    expect(volumes.get(34)).toBe(0.01);
  });

  it('leaves a ship the catalogue lacks unknown rather than using its assembled volume', async () => {
    const volumes = await loadTypePackagedVolumes([99999], new Set([99999]));
    expect(volumes.has(99999)).toBe(false);
  });
});
