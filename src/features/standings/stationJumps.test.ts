import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { loadJumpsFromCurrent, loadNearestStation } from './stationJumps';

const mocks = vi.hoisted(() => ({ stations: vi.fn(), jumps: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: mocks.stations }));
vi.mock('@/features/route/jumpsFromCurrent', () => ({ jumpsFromCurrent: mocks.jumps }));
const sweep = vi.hoisted(() => ({ origin: vi.fn(), basis: vi.fn(), distances: vi.fn() }));
vi.mock('@/features/route/currentSystem', () => ({ loadCurrentSystemId: sweep.origin }));
vi.mock('@/features/route/jumpBasis', () => ({ loadJumpBasis: sweep.basis }));
vi.mock('@/features/route/localRoute', () => ({ localJumpDistances: sweep.distances }));

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

describe('loadJumpsFromCurrent', () => {
  beforeEach(() => {
    sweep.origin.mockReset().mockResolvedValue(30000142);
    sweep.basis.mockReset().mockResolvedValue({ rules: { r: 1 }, network: { n: 1 } });
    sweep.distances.mockReset().mockResolvedValue({
      kind: 'known',
      jumps: new Map([
        [30000142, 0],
        [30000144, 1],
      ]),
    });
  });

  it('sweeps once from the current system under the Route Safety basis', async () => {
    const jumps = await loadJumpsFromCurrent(91);
    expect(sweep.distances).toHaveBeenCalledTimes(1);
    expect(sweep.distances).toHaveBeenCalledWith(30000142, { r: 1 }, { n: 1 });
    expect(jumps?.get(30000144)).toBe(1);
  });

  it('is null when the current system is unknown', async () => {
    sweep.origin.mockResolvedValue(null);
    expect(await loadJumpsFromCurrent(91)).toBeNull();
    expect(sweep.distances).not.toHaveBeenCalled();
  });

  it('is null when the map is unreadable or the lookup fails', async () => {
    sweep.distances.mockResolvedValue({ kind: 'unknown' });
    expect(await loadJumpsFromCurrent(91)).toBeNull();
    sweep.origin.mockRejectedValue(new Error('offline'));
    expect(await loadJumpsFromCurrent(91)).toBeNull();
  });
});
