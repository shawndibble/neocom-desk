import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NpcStationEntry } from './marketTypes';

const STATIONS: NpcStationEntry[] = [
  {
    id: 60003760,
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemId: 30000142,
    typeId: 52678,
  },
  { id: 60008494, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: 30002187 },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => STATIONS);
vi.mock('./loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
}));

import { clearNpcStationIndex, lookupNpcStation } from './npcStations';

beforeEach(() => {
  clearNpcStationIndex();
  loadNpcStations.mockReset();
  loadNpcStations.mockResolvedValue(STATIONS);
});

describe('lookupNpcStation', () => {
  it('answers with the entry for an id the snapshot holds', async () => {
    expect(await lookupNpcStation(60003760)).toEqual({
      id: 60003760,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      systemId: 30000142,
      typeId: 52678,
    });
  });

  it('answers null — not undefined — for an id a loaded snapshot does not hold', async () => {
    // The whole point of item E's discriminator: stations.json is the entire
    // staStations table, so "loaded, and this id is not in it" means player
    // structure, which is a definitive answer rather than a lookup miss.
    expect(await lookupNpcStation(1000000000001)).toBeNull();
  });

  it('answers undefined when the snapshot itself cannot be read', async () => {
    // stations.json sits outside the install precache on purpose, so a first
    // offline visit legitimately has no snapshot — and concluding "player
    // structure" from that would send every NPC station to the wrong endpoint.
    loadNpcStations.mockRejectedValue(new Error('offline'));

    expect(await lookupNpcStation(60003760)).toBeUndefined();
  });

  it('indexes the snapshot once, however many ids are asked for', async () => {
    await Promise.all([60003760, 60008494, 1000000000001, 60003760].map(lookupNpcStation));

    expect(loadNpcStations).toHaveBeenCalledTimes(1);
  });

  it('retries the snapshot after a failure instead of memoizing the failure', async () => {
    loadNpcStations.mockRejectedValueOnce(new Error('offline'));
    expect(await lookupNpcStation(60003760)).toBeUndefined();

    expect((await lookupNpcStation(60003760))?.name).toBe(
      'Jita IV - Moon 4 - Caldari Navy Assembly Plant'
    );
  });
});
