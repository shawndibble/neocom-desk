import { describe, expect, it } from 'vitest';
import { treeFor } from '@/engine/shipTree/templates';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { ShipTreeData, ShipTreeFaction, ShipTreeShip } from '@/sde/types';
import {
  allSectionIds,
  DEFAULT_FACTION_ID,
  factionMatchCounts,
  factionNameOf,
  flyableCount,
  flyStateCounts,
  hullMatches,
  isShipTreeFiltered,
  masteryCounts,
  masteryFilterActive,
  NO_SHIP_TREE_FILTER,
  type ShipTreeFilter,
  inGameFactionOrder,
  ladderSections,
  sectionPath,
  masteryTierEntries,
  ownedBlueprintSummary,
  resolveFactionID,
  searchHulls,
  techMark,
  tierPlanned,
  traitGroups,
  unplannedTierEntries,
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

describe('tierPlanned', () => {
  const trained = () => 0;
  it('is false for an empty tier', () => {
    expect(tierPlanned([], trained, [])).toBe(false);
  });

  it('is false when a skill the tier needs has no plan entry', () => {
    const tier = [{ skillTypeID: 1, level: 4 }];
    expect(tierPlanned(tier, trained, [])).toBe(false);
  });

  it('is true once every untrained skill in the tier is covered by the plan', () => {
    const tier = [
      { skillTypeID: 1, level: 4 },
      { skillTypeID: 2, level: 3 },
    ];
    const plan = [
      { skillTypeID: 1, targetLevel: 4 },
      { skillTypeID: 2, targetLevel: 5 },
    ];
    expect(tierPlanned(tier, trained, plan)).toBe(true);
  });

  it('is false once the tier is already fully trained — nothing left to plan for', () => {
    const tier = [{ skillTypeID: 1, level: 4 }];
    expect(tierPlanned(tier, () => 4, [])).toBe(false);
  });
});

describe('unplannedTierEntries', () => {
  const tiers = [
    [{ skillTypeID: 1, level: 2 }],
    [
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 2, level: 1 },
    ],
  ];
  const trained = () => 0;

  it('is the same as masteryTierEntries when nothing is planned yet', () => {
    expect(unplannedTierEntries(tiers, 2, trained, [])).toEqual(
      masteryTierEntries(tiers, 2, trained)
    );
  });

  it('drops entries the plan already covers', () => {
    const plan = [{ skillTypeID: 1, targetLevel: 3 }];
    expect(unplannedTierEntries(tiers, 2, trained, plan)).toEqual([
      { skillTypeID: 2, targetLevel: 1 },
    ]);
  });

  it('is empty once the plan covers every untrained skill through the tier', () => {
    const plan = [
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 2, targetLevel: 1 },
    ];
    expect(unplannedTierEntries(tiers, 2, trained, plan)).toEqual([]);
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

describe('ship tree filters', () => {
  const flyable = (mastery: number): ShipTreeHullStatus => ({
    canFly: true,
    secondsToFly: 0,
    mastery,
  });
  const locked: ShipTreeHullStatus = { canFly: false, secondsToFly: 3600, mastery: 0 };
  const filter = (over: Partial<ShipTreeFilter>): ShipTreeFilter => ({
    ...NO_SHIP_TREE_FILTER,
    ...over,
  });

  it('matches every hull with no filter, including one with no status yet', () => {
    expect(hullMatches(flyable(3), NO_SHIP_TREE_FILTER)).toBe(true);
    expect(hullMatches(locked, NO_SHIP_TREE_FILTER)).toBe(true);
    expect(hullMatches(undefined, NO_SHIP_TREE_FILTER)).toBe(true);
    expect(isShipTreeFiltered(NO_SHIP_TREE_FILTER)).toBe(false);
  });

  it('splits by fly state; a hull with no status counts as not flyable', () => {
    expect(hullMatches(flyable(0), filter({ fly: 'canFly' }))).toBe(true);
    expect(hullMatches(locked, filter({ fly: 'canFly' }))).toBe(false);
    expect(hullMatches(locked, filter({ fly: 'cantFly' }))).toBe(true);
    expect(hullMatches(undefined, filter({ fly: 'cantFly' }))).toBe(true);
    expect(hullMatches(flyable(5), filter({ fly: 'cantFly' }))).toBe(false);
  });

  it('keeps flyable hulls at a picked Mastery tier; None is tier 0', () => {
    const f = filter({ mastery: new Set([0, 3]) });
    expect(hullMatches(flyable(3), f)).toBe(true);
    expect(hullMatches(flyable(0), f)).toBe(true);
    expect(hullMatches(flyable(4), f)).toBe(false);
    expect(hullMatches(locked, f)).toBe(false);
    expect(masteryFilterActive(f)).toBe(true);
    expect(isShipTreeFiltered(f)).toBe(true);
  });

  it("ignores the Mastery pick while Can't fly is picked", () => {
    const f = filter({ fly: 'cantFly', mastery: new Set([3]) });
    expect(masteryFilterActive(f)).toBe(false);
    expect(hullMatches(locked, f)).toBe(true);
  });

  const statuses = new Map<number, ShipTreeHullStatus>([
    [1, flyable(0)],
    [2, flyable(3)],
    [3, flyable(3)],
    [4, locked],
  ]);
  const caldari = [1, 2, 3, 4, 5].map((typeID) => ship({ typeID }));

  it("counts a faction's fly-state split; a hull with no status can't be flown", () => {
    expect(flyStateCounts(caldari, statuses)).toEqual({ all: 5, canFly: 3, cantFly: 2 });
  });

  it('counts flyable hulls per Mastery tier, None through V', () => {
    expect(masteryCounts(caldari, statuses)).toEqual([1, 0, 0, 2, 0, 0]);
  });

  it('counts each faction’s matches; a faction with none is 0', () => {
    const ships = [...caldari, ship({ typeID: 6, factionID: 500003 })];
    const counts = factionMatchCounts(
      [500001, 500003, 500004],
      ships,
      statuses,
      filter({ mastery: new Set([3]) })
    );
    expect([...counts]).toEqual([
      [500001, 2],
      [500003, 0],
      [500004, 0],
    ]);
  });

  it('finds the path down to a nested section', () => {
    const def = (id: number) => ({ id }) as never;
    const sections = [
      { def: def(1), children: [{ def: def(2), children: [] }] },
      { def: def(3), children: [] },
    ];
    expect(sectionPath(sections, 2)).toEqual([1, 2]);
    expect(sectionPath(sections, 3)).toEqual([3]);
    expect(sectionPath(sections, 9)).toEqual([]);
  });

  it('lists every section id, nested ones too', () => {
    const def = (id: number) => ({ id }) as never;
    expect(
      allSectionIds([
        { def: def(1), children: [{ def: def(2), children: [] }] },
        { def: def(3), children: [] },
      ])
    ).toEqual([1, 2, 3]);
  });
});
