import { describe, expect, it } from 'vitest';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { corporationStationFacts, factionStationFacts } from './stationFacts';

const JITA_NAVY = 1000035;
const station = (
  id: number,
  systemId: number,
  ownerCorporationId?: number,
  ownerFactionId?: number
): NpcStationEntry => ({ id, name: `s${id}`, systemId, ownerCorporationId, ownerFactionId });

const STATIONS = [
  station(60003760, 30000142, JITA_NAVY, 500001), // Jita 4-4, Caldari Navy
  station(2, 30000142, JITA_NAVY, 500001), // same system
  station(3, 30000144, JITA_NAVY, 500001),
  station(4, 30000200, 1000002, 500001), // CBD, same faction
  station(60005686, 30002053, 1000057, 500002), // Hek VIII, Boundless Creation
  station(60004588, 30002510, 1000049, 500002), // Rens VI, Brutor Tribe
  station(5, 30000300), // owner unknown
];

describe('corporationStationFacts', () => {
  it('counts the corporation stations and their distinct systems', () => {
    const facts = corporationStationFacts(JITA_NAVY, STATIONS);
    expect(facts.stationCount).toBe(3);
    expect(facts.systemIds).toEqual([30000142, 30000144]);
    expect(facts.stations.map((s) => s.id)).toEqual([60003760, 2, 3]);
  });

  it('finds the Trade Hub it owns', () => {
    expect(corporationStationFacts(JITA_NAVY, STATIONS).tradeHubs.map((h) => h.id)).toEqual([
      'jita',
    ]);
  });

  it('has no Trade Hub for an ordinary corporation', () => {
    expect(corporationStationFacts(1000002, STATIONS).tradeHubs).toEqual([]);
  });

  it('knows no stations for a corporation that owns none', () => {
    expect(corporationStationFacts(1000130, STATIONS)).toEqual({
      stations: [],
      stationCount: 0,
      systemIds: [],
      tradeHubs: [],
    });
  });
});

describe('factionStationFacts', () => {
  it('spans every corporation of the faction and each hub they own', () => {
    const facts = factionStationFacts(500002, STATIONS);
    expect(facts.stationCount).toBe(2);
    expect(facts.tradeHubs.map((h) => h.id).sort()).toEqual(['hek', 'rens']);
  });

  it('counts the stations of all the faction corporations', () => {
    expect(factionStationFacts(500001, STATIONS).stationCount).toBe(4);
  });
});
