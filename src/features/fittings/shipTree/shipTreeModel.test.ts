import { describe, expect, it } from 'vitest';
import { treeFor } from '@/engine/shipTree/templates';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { ShipTreeData, ShipTreeFaction, ShipTreeShip } from '@/sde/types';
import {
  DEFAULT_FACTION_ID,
  factionNameOf,
  flyableCount,
  inGameFactionOrder,
  ladderSections,
  masteryTierEntries,
  ownedBlueprintSummary,
  resolveFactionID,
  searchHulls,
  techMark,
  traitGroups,
} from './shipTreeModel';

function ship(over: Partial<ShipTreeShip>): ShipTreeShip {
  return {
    typeID: 1,
    name: 'Hull',
    factionID: 500001,
    treeGroupID: 8,
    techLevel: 1,
    metaLevel: 0,
    required: [],
    traits: [],
    stats: {
      highSlots: 0,
      medSlots: 0,
      lowSlots: 0,
      rigSlots: 0,
      rigSize: 0,
      turretHardpoints: 0,
      launcherHardpoints: 0,
      cpu: 0,
      powergrid: 0,
      calibration: 0,
      droneBay: 0,
      droneBandwidth: 0,
    },
    description: '',
    ...over,
  };
}

describe('factionNameOf', () => {
  const factions: ShipTreeFaction[] = [{ id: 500001, name: 'Caldari State', description: '' }];
  it("names a listed faction, '' otherwise", () => {
    expect(factionNameOf(factions, 500001)).toBe('Caldari State');
    expect(factionNameOf(factions, 42)).toBe('');
  });
});

describe('flyableCount', () => {
  it('counts the hulls the pilot can fly out of all given', () => {
    const statuses = new Map<number, ShipTreeHullStatus>([
      [1, { canFly: true, secondsToFly: 0, mastery: 0 }],
      [2, { canFly: false, secondsToFly: 60, mastery: 0 }],
    ]);
    const ships = [ship({ typeID: 1 }), ship({ typeID: 2 }), ship({ typeID: 3 })];
    expect(flyableCount(ships, statuses)).toEqual({ flyable: 1, total: 3 });
    expect(flyableCount([], statuses)).toEqual({ flyable: 0, total: 0 });
  });
});

describe('ladderSections', () => {
  it('lists main and industry classes at the top, nesting the rest under their parent', () => {
    const defs = treeFor(500001, new Set([4, 8, 9, 32, 33, 35, 36, 40]));
    const sections = ladderSections(defs);
    expect(sections.map((s) => s.def.id)).toEqual([4, 8, 32, 35, 36]);
    expect(sections.find((s) => s.def.id === 8)?.children.map((c) => c.def.id)).toEqual([9]);
    expect(sections.find((s) => s.def.id === 32)?.children.map((c) => c.def.id)).toEqual([33]);
    expect(sections.find((s) => s.def.id === 36)?.children.map((c) => c.def.id)).toEqual([40]);
  });

  it('keeps a class the template does not know as its own top-level section', () => {
    const sections = ladderSections([{ id: 999, parent: null, lane: 'branch' }]);
    expect(sections.map((s) => s.def.id)).toEqual([999]);
  });
});

describe('techMark', () => {
  it('marks Tech II, Tech III and Navy/faction hulls', () => {
    expect(techMark(ship({ techLevel: 2 }))).toBe('t2');
    expect(techMark(ship({ techLevel: 3 }))).toBe('t3');
    expect(techMark(ship({ metaLevel: 6 }))).toBe('faction');
    expect(techMark(ship({ treeGroupID: 9 }))).toBe('faction');
    // Guristas Mamba: meta 0 in the SDE, yet the game marks it like every pirate hull.
    expect(techMark(ship({ factionID: 500010, metaLevel: 0 }))).toBe('faction');
    expect(techMark(ship({}))).toBeNull();
  });
});

describe('traitGroups', () => {
  it('groups bonuses by skill, role bonuses on their own, in first-seen order', () => {
    const groups = traitGroups([
      { skillTypeID: 3329, bonus: 7.5, unit: '%', text: 'a' },
      { skillTypeID: null, bonus: null, unit: '', text: 'b' },
      { skillTypeID: 3329, bonus: 10, unit: '%', text: 'c' },
    ]);
    expect(groups).toEqual([
      {
        skillTypeID: 3329,
        traits: [expect.objectContaining({ text: 'a' }), expect.objectContaining({ text: 'c' })],
      },
      { skillTypeID: null, traits: [expect.objectContaining({ text: 'b' })] },
    ]);
  });
});

describe('resolveFactionID', () => {
  const data = { factions: [{ id: 500001 }, { id: 500010 }] } as unknown as ShipTreeData;
  it('keeps a faction the tree has and falls back to Caldari otherwise', () => {
    expect(resolveFactionID(data, 500010)).toBe(500010);
    expect(resolveFactionID(data, 42)).toBe(DEFAULT_FACTION_ID);
    expect(resolveFactionID(null, 500010)).toBe(DEFAULT_FACTION_ID);
  });
});

describe('searchHulls', () => {
  const ships = [
    ship({ typeID: 1, name: 'Merlin' }),
    ship({ typeID: 2, name: 'Hawk' }),
    ship({ typeID: 3, name: 'Harpy' }),
  ];
  it('matches case-insensitively, earliest match first, and nothing for a blank query', () => {
    expect(searchHulls(ships, 'r').map((s) => s.name)).toEqual(['Harpy', 'Merlin']);
    expect(searchHulls(ships, 'HA').map((s) => s.name)).toEqual(['Harpy', 'Hawk']);
    expect(searchHulls(ships, '  ')).toEqual([]);
  });
});

describe('masteryTierEntries', () => {
  const tiers = [
    [{ skillTypeID: 1, level: 2 }],
    [
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 2, level: 1 },
    ],
    [{ skillTypeID: 3, level: 4 }],
  ];
  it('merges tiers I..N by skill at the highest level asked, untrained only', () => {
    const trained = (id: number) => (id === 2 ? 1 : 0);
    expect(masteryTierEntries(tiers, 2, trained)).toEqual([{ skillTypeID: 1, targetLevel: 3 }]);
    expect(masteryTierEntries(tiers, 3, trained)).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 4 },
    ]);
  });
});

describe('ownedBlueprintSummary', () => {
  const bp = (type_id: number, runs: number): CharacterBlueprint => ({
    item_id: Math.random(),
    type_id,
    runs,
    material_efficiency: 0,
    time_efficiency: 0,
    quantity: -2,
    location_id: 1,
    location_flag: 'Hangar',
  });
  it('counts originals and copies of one blueprint, one row per copy', () => {
    expect(ownedBlueprintSummary([bp(10, -1), bp(10, 5), bp(10, 3), bp(11, -1)], 10)).toEqual({
      originals: 1,
      copies: 2,
    });
    expect(ownedBlueprintSummary([], 10)).toEqual({ originals: 0, copies: 0 });
  });
});

describe('inGameFactionOrder', () => {
  it("sorts factions as the game's own panel does, unknown ones last", () => {
    const f = (id: number) => ({ id, name: String(id), description: '' });
    const ordered = inGameFactionOrder([f(1), f(500001), f(500014), f(500003), f(500029)]);
    expect(ordered.map((x) => x.id)).toEqual([500003, 500001, 500014, 500029, 1]);
  });
});
