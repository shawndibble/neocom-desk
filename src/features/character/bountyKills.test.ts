import { describe, it, expect } from 'vitest';
import { killsByFaction, parseBountyKills, pirateFactionOf } from './bountyKills';

describe('parseBountyKills', () => {
  it('parses ESI\'s "typeID: count" list into kills, most killed first', () => {
    expect(parseBountyKills('17039: 2,2072: 1,16938: 3')).toEqual([
      { typeId: 16938, count: 3 },
      { typeId: 17039, count: 2 },
      { typeId: 2072, count: 1 },
    ]);
  });

  it('tolerates spaces and a trailing comma', () => {
    expect(parseBountyKills(' 24001: 4 , 24009:3,')).toEqual([
      { typeId: 24001, count: 4 },
      { typeId: 24009, count: 3 },
    ]);
  });

  it('merges a type listed twice', () => {
    expect(parseBountyKills('100: 1,100: 2')).toEqual([{ typeId: 100, count: 3 }]);
  });

  it('returns null for a reason that is not a kill list', () => {
    expect(parseBountyKills('moon tax Aug')).toBeNull();
    expect(parseBountyKills('17039: 2, and some text')).toBeNull();
    expect(parseBountyKills('')).toBeNull();
    expect(parseBountyKills(undefined)).toBeNull();
  });
});

describe('pirateFactionOf', () => {
  it.each([
    ['Deadspace Blood Raiders Battleship', 'Blood Raiders'],
    ['Deadspace Serpentis Cruiser', 'Serpentis'],
    ['Asteroid Guristas Frigate', 'Guristas'],
    ["Asteroid Sansha's Nation Commander Battleship", "Sansha's Nation"],
    ['Asteroid Angel Cartel Destroyer', 'Angel Cartel'],
    ['Asteroid Rogue Drone Cruiser', 'Rogue Drones'],
    ['Asteroid Mordus Legion Commander Frigate', "Mordu's Legion"],
    ['Deadspace Blood Raiders BattleCruiser', 'Blood Raiders'],
    ['Destructible Sentry Gun', null],
  ])('%s → %s', (groupName, faction) => {
    expect(pirateFactionOf(groupName)).toBe(faction);
  });
});

describe('killsByFaction', () => {
  const kills = [
    { typeId: 1, count: 3 },
    { typeId: 2, count: 2 },
    { typeId: 3, count: 4 },
    { typeId: 4, count: 1 },
    { typeId: 5, count: 2 },
  ];
  const factions = new Map<number, string | null>([
    [1, 'Blood Raiders'],
    [2, 'Serpentis'],
    [3, 'Blood Raiders'],
    [4, null],
  ]);

  it('sums counts per faction, largest first, with unknown and unaffiliated kills as a trailing null', () => {
    expect(killsByFaction(kills, factions)).toEqual([
      { faction: 'Blood Raiders', count: 7 },
      { faction: 'Serpentis', count: 2 },
      { faction: null, count: 3 },
    ]);
  });

  it('omits the null bucket when every kill has a faction', () => {
    expect(killsByFaction(kills.slice(0, 2), factions)).toEqual([
      { faction: 'Blood Raiders', count: 3 },
      { faction: 'Serpentis', count: 2 },
    ]);
  });
});
