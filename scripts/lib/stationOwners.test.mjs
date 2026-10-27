import { describe, it, expect } from 'vitest';
import { npcCorpFactions, stationOwnerFields } from './stationOwners.mjs';

const CORP_ROWS = [
  ['corporationID', 'size', 'factionID', 'corporationName'],
  ['1000002', 'L', '500001', 'CBD Corporation'],
  ['1000035', 'L', '500001', 'Caldari Navy'],
  // A corp that belongs to no faction: a blank column, not zero.
  ['1000001', 'S', '', 'Doomheim'],
  // A short row must not become a NaN key.
  [''],
];

describe('npcCorpFactions', () => {
  it('maps each NPC corporation to its faction and skips blank ones', () => {
    const map = npcCorpFactions(CORP_ROWS);
    expect(map.get(1000002)).toBe(500001);
    expect(map.get(1000035)).toBe(500001);
    expect(map.has(1000001)).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe('stationOwnerFields', () => {
  const factions = npcCorpFactions(CORP_ROWS);

  it('carries the owner corporation and its faction', () => {
    expect(stationOwnerFields('1000002', factions)).toEqual({
      ownerCorporationId: 1000002,
      ownerFactionId: 500001,
    });
  });

  it('leaves the faction key off for a factionless owner', () => {
    expect(stationOwnerFields('1000001', factions)).toEqual({ ownerCorporationId: 1000001 });
  });

  it('leaves both keys off for a blank or malformed owner column', () => {
    expect(stationOwnerFields('', factions)).toEqual({});
    expect(stationOwnerFields(undefined, factions)).toEqual({});
  });
});
