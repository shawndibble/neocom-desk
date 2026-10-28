import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcCorporationEntry } from '@/sde/types';
import {
  corporationFactionMap,
  corporationsOfFaction,
  loadCorporationFactions,
} from './corporationFactions';

const npcFile = vi.hoisted(() => vi.fn());
vi.mock('@/sde/loadSde', () => ({ loadNpcCorporationsFile: npcFile }));

const NPC: NpcCorporationEntry[] = [
  { id: 1000035, name: 'Caldari Navy', ticker: 'CN', factionId: 500001 },
  { id: 1000002, name: 'Caldari Provisions', ticker: 'CP', factionId: 500001 },
  // No station, no LP store: still a pirate corporation, through the file.
  { id: 1000140, name: 'Pirate Remnant', ticker: 'PR', factionId: 500019 },
  { id: 1000130, name: 'Sisters of EVE', ticker: 'SoE' }, // factionless
];

describe('corporationFactionMap', () => {
  it('maps every corporation that has a faction', () => {
    const map = corporationFactionMap(NPC);
    expect(map.get(1000035)).toBe(500001);
    expect(map.get(1000140)).toBe(500019);
  });

  it('leaves out a corporation with no faction', () => {
    expect(corporationFactionMap(NPC).has(1000130)).toBe(false);
  });
});

describe('corporationsOfFaction', () => {
  it('lists the corporations of one faction', () => {
    const map = corporationFactionMap(NPC);
    expect(corporationsOfFaction(map, 500001).sort()).toEqual([1000002, 1000035]);
    expect(corporationsOfFaction(map, 500019)).toEqual([1000140]);
    expect(corporationsOfFaction(map, 500003)).toEqual([]);
  });
});

describe('loadCorporationFactions', () => {
  beforeEach(() => {
    loadCorporationFactions.reset();
    npcFile.mockReset().mockResolvedValue({ factions: [], corporations: NPC });
  });

  it('builds the map from the NPC-corporation file', async () => {
    expect((await loadCorporationFactions()).get(1000140)).toBe(500019);
  });

  it('reads the file once for the session', async () => {
    await loadCorporationFactions();
    await loadCorporationFactions();
    expect(npcFile).toHaveBeenCalledTimes(1);
  });

  it('rejects when the file cannot be read, and retries on the next call', async () => {
    npcFile.mockRejectedValueOnce(new Error('offline'));
    await expect(loadCorporationFactions()).rejects.toThrow('offline');
    expect((await loadCorporationFactions()).get(1000035)).toBe(500001);
  });
});
