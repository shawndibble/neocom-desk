import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';
import type { NpcCorporationEntry } from '@/sde/types';
import {
  corporationFactionMap,
  corporationsOfFaction,
  loadCorporationFactions,
} from './corporationFactions';

const mocks = vi.hoisted(() => ({ npc: vi.fn(), lp: vi.fn(), stations: vi.fn() }));
vi.mock('@/sde/loadSde', () => ({ loadNpcCorporationsFile: mocks.npc }));
vi.mock('@/sde/loadMarketSde', () => ({
  loadLpCorporations: mocks.lp,
  loadNpcStations: mocks.stations,
}));

const NPC: NpcCorporationEntry[] = [
  { id: 1000035, name: 'Caldari Navy', ticker: 'CN', factionId: 500001 },
  // No station, no LP store: only the NPC-corporation file knows it is a pirate corporation.
  { id: 1000140, name: 'Pirate Remnant', ticker: 'PR', factionId: 500019 },
  { id: 1000130, name: 'Sisters of EVE', ticker: 'SoE' }, // factionless
];
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
  it('knows a corporation that has no station and no LP store, from the NPC-corporation file', () => {
    expect(corporationFactionMap(NPC, LP, STATIONS).get(1000140)).toBe(500019);
  });

  it('falls back to the LP-store corporations and station owners for a corporation the file lacks', () => {
    const map = corporationFactionMap(NPC, LP, STATIONS);
    expect(map.get(1000002)).toBe(500001); // station owner
    expect(map.get(1000127)).toBe(500010);
  });

  it('prefers the NPC-corporation file when the snapshots disagree', () => {
    const stale: NpcStationEntry[] = [
      { id: 9, name: 'x', systemId: 9, ownerCorporationId: 1000140, ownerFactionId: 500001 },
    ];
    expect(corporationFactionMap(NPC, [], stale).get(1000140)).toBe(500019);
  });

  it('leaves out a corporation with no faction anywhere', () => {
    const map = corporationFactionMap(NPC, LP, STATIONS);
    expect(map.has(1000130)).toBe(false);
    expect(map.has(1000999)).toBe(false);
  });
});

describe('corporationsOfFaction', () => {
  it('lists the corporations of one faction', () => {
    const map = corporationFactionMap(NPC, LP, STATIONS);
    expect(corporationsOfFaction(map, 500001).sort()).toEqual([1000002, 1000035]);
    expect(corporationsOfFaction(map, 500010)).toEqual([1000127]);
    expect(corporationsOfFaction(map, 500003)).toEqual([]);
  });
});

describe('loadCorporationFactions', () => {
  beforeEach(() => {
    mocks.npc.mockReset().mockResolvedValue({ factions: [], corporations: NPC });
    mocks.lp.mockReset().mockResolvedValue(LP);
    mocks.stations.mockReset().mockResolvedValue(STATIONS);
  });

  it('builds the map from the NPC-corporation file and the fallback snapshots', async () => {
    const map = await loadCorporationFactions();
    expect(map.get(1000140)).toBe(500019);
    expect(map.get(1000127)).toBe(500010);
  });

  it('still answers from the NPC-corporation file when a fallback snapshot is unreadable', async () => {
    mocks.lp.mockRejectedValue(new Error('offline'));
    mocks.stations.mockRejectedValue(new Error('offline'));
    expect((await loadCorporationFactions()).get(1000035)).toBe(500001);
  });

  it('rejects when the NPC-corporation file cannot be read', async () => {
    mocks.npc.mockRejectedValue(new Error('offline'));
    await expect(loadCorporationFactions()).rejects.toThrow('offline');
  });
});
