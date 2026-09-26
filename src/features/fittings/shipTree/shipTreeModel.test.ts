import { describe, expect, it } from 'vitest';
import {
  FACTION_IDS,
  GROUPS,
  alphaMaxLevel,
  hullCounts,
} from '@/engine/shipTree/__fixtures__/classData';
import { classNeedsOmega } from '@/engine/shipTree/rules';
import { layoutShipTree } from '@/engine/shipTree/layout';
import { treeFor } from '@/engine/shipTree/templates';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { ShipTreeData, ShipTreeShip } from '@/sde/types';
import {
  DEFAULT_FACTION_ID,
  ladderSections,
  masteryTierEntries,
  omegaChipClasses,
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

describe('omegaChipClasses', () => {
  it('puts a chip on exactly the classes the map draws an Ω before, for every faction', () => {
    for (const factionID of FACTION_IDS) {
      const counts = hullCounts(factionID);
      const defs = treeFor(factionID, new Set(counts.keys()));
      const needsOmega = (id: number) => classNeedsOmega(GROUPS.get(id), factionID, alphaMaxLevel);
      const layout = layoutShipTree({
        factionID,
        defs,
        hullCounts: counts,
        needsOmega,
        parentEmpires: () => [],
      });
      expect(omegaChipClasses(defs, needsOmega).size, `faction ${factionID}`).toBe(
        layout.omegas.length
      );
    }
  });

  it('marks only the first Omega class of a stack', () => {
    const defs = treeFor(500001, new Set([4, 8, 9, 10, 11]));
    const needsOmega = (id: number) => id === 10 || id === 11;
    expect([...omegaChipClasses(defs, needsOmega)]).toEqual([10]);
  });

  it('lets the main-line Ω before the Dreadnought cover its capital trunk', () => {
    const defs = treeFor(500001, new Set([4, 8, 26, 32, 33, 34]));
    const needsOmega = (id: number) => id === 32 || id === 33 || id === 34;
    expect([...omegaChipClasses(defs, needsOmega)]).toEqual([32]);
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
