import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { loadNearestStation } from './stationJumps';

const mocks = vi.hoisted(() => ({ stations: vi.fn(), jumps: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: mocks.stations }));
vi.mock('@/features/route/jumpsFromCurrent', () => ({ jumpsFromCurrent: mocks.jumps }));

const STATIONS: NpcStationEntry[] = [
  { id: 10, name: 'Far', systemId: 1, ownerCorporationId: 100 },
  { id: 11, name: 'Near', systemId: 2, ownerCorporationId: 100 },
  { id: 12, name: 'Other corp, nearer', systemId: 3, ownerCorporationId: 200 },
];

describe('loadNearestStation', () => {
  beforeEach(() => {
    mocks.stations.mockReset().mockResolvedValue(STATIONS);
    mocks.jumps.mockReset().mockResolvedValue(
      new Map([
        [1, 9],
        [2, 4],
        [3, 1],
      ])
    );
  });

  it("is the corporation's own nearest station, counted under the Route Safety basis", async () => {
    expect(await loadNearestStation(7, 100)).toEqual({
      stationId: 11,
      stationName: 'Near',
      systemId: 2,
      jumps: 4,
    });
    expect(mocks.jumps).toHaveBeenCalledWith(7, [1, 2]);
  });

  it('is null when no jump count is known (no origin, no route)', async () => {
    mocks.jumps.mockResolvedValue(new Map());
    expect(await loadNearestStation(7, 100)).toBeNull();
  });

  it('is null for a corporation with no stations, asking about no systems', async () => {
    expect(await loadNearestStation(7, 300)).toBeNull();
    expect(mocks.jumps).toHaveBeenCalledWith(7, []);
  });
});
