import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';
import {
  corporationFactionMap,
  corporationsOfFaction,
  loadCorporationFactions,
} from './corporationFactions';

const mocks = vi.hoisted(() => ({ lp: vi.fn(), stations: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({
  loadLpCorporations: mocks.lp,
  loadNpcStations: mocks.stations,
}));

const LP: LpCorporationEntry[] = [
  { id: 1000035, name: 'Caldari Navy', factionId: 500001 },
  { id: 1000130, name: 'Sisters of EVE' }, // factionless
];
const STATIONS: NpcStationEntry[] = [
  { id: 1, name: 'a', systemId: 1, ownerCorporationId: 1000035, ownerFactionId: 500001 },
  { id: 2, name: 'b', systemId: 2, ownerCorporationId: 1000002, ownerFactionId: 500001 },
  { id: 3, name: 'c', systemId: 3, ownerCorporationId: 1000127, ownerFactionId: 500010 },
  { id: 4, name: 'd', systemId: 4, ownerCorporationId: 1000999 }, // factionless owner
  { id: 5, name: 'e', systemId: 5 }, // snapshot without owners
];

describe('corporationFactionMap', () => {
  it('joins the LP-store corporations and the station owners', () => {
    expect(corporationFactionMap(LP, STATIONS)).toEqual(
      new Map([
        [1000035, 500001],
        [1000002, 500001],
        [1000127, 500010],
      ])
    );
  });

  it('leaves out a corporation with no faction', () => {
    expect(corporationFactionMap(LP, STATIONS).has(1000130)).toBe(false);
    expect(corporationFactionMap(LP, STATIONS).has(1000999)).toBe(false);
  });
});

describe('corporationsOfFaction', () => {
  it('lists the corporations of one faction', () => {
    const map = corporationFactionMap(LP, STATIONS);
    expect(corporationsOfFaction(map, 500001).sort()).toEqual([1000002, 1000035]);
    expect(corporationsOfFaction(map, 500010)).toEqual([1000127]);
    expect(corporationsOfFaction(map, 500003)).toEqual([]);
  });
});

describe('loadCorporationFactions', () => {
  beforeEach(() => {
    mocks.lp.mockReset().mockResolvedValue(LP);
    mocks.stations.mockReset().mockResolvedValue(STATIONS);
  });

  it('builds the map from the shipped snapshots', async () => {
    expect((await loadCorporationFactions()).get(1000127)).toBe(500010);
  });
});
