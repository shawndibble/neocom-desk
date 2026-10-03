import { describe, expect, it } from 'vitest';
import {
  IMPLANT_GOALS,
  cheapestFixes,
  goalById,
  goalGain,
  groupImplantFamilies,
  headroom,
  keepMoreHeadroom,
  implantEntriesFromMarket,
  parseImplantGrade,
  pickSource,
  withImplant,
} from './implantFinder';
import type { FittingStats } from './types';

function stats(over: Partial<FittingStats>): FittingStats {
  return {
    cpuUsed: 0,
    cpuTotal: 0,
    powergridUsed: 0,
    powergridTotal: 0,
    capacitorCapacity: 0,
    capacitorRechargeTime: 0,
    ehp: 0,
    droneDps: 0,
    offense: {
      weapons: [],
      dps: 0,
      sustainedDps: 0,
      volley: 0,
      overheated: null,
      chargelessWeaponCount: 0,
    },
    navigation: { maxVelocity: 0, agility: 0, mass: 0, warpSpeed: 0 },
    targeting: { maxTargetRange: 0, maxLockedTargets: 0, scanResolution: 0, signatureRadius: 0 },
    ...over,
  } as FittingStats;
}

describe('parseImplantGrade', () => {
  it('splits a hardwiring name into its family, code and grade', () => {
    expect(parseImplantGrade("Zainou 'Gypsy' CPU Management EE-605")).toEqual({
      family: "Zainou 'Gypsy' CPU Management",
      code: 'EE-605',
      grade: 5,
    });
  });

  it('reads a four-digit code (slot 10) the same way', () => {
    expect(parseImplantGrade("Zainou 'Gnome' Weapon Upgrades WU-1003")).toEqual({
      family: "Zainou 'Gnome' Weapon Upgrades",
      code: 'WU-1003',
      grade: 3,
    });
  });

  it('is null for an implant without a grade code', () => {
    expect(parseImplantGrade('High-grade Crystal Alpha')).toBeNull();
    expect(parseImplantGrade('Memory Augmentation - Basic')).toBeNull();
  });
});

describe('groupImplantFamilies', () => {
  it('collects the grades of one family in order, and keeps an ungraded implant on its own', () => {
    const families = groupImplantFamilies([
      { typeId: 3, name: "Zainou 'Gypsy' CPU Management EE-606", slot: 6 },
      { typeId: 1, name: "Zainou 'Gypsy' CPU Management EE-602", slot: 6 },
      { typeId: 2, name: "Zainou 'Gypsy' CPU Management EE-604", slot: 6 },
      { typeId: 9, name: 'High-grade Crystal Alpha', slot: 1 },
    ]);
    expect(families).toEqual([
      {
        key: "Zainou 'Gypsy' CPU Management EE-60",
        name: "Zainou 'Gypsy' CPU Management",
        slot: 6,
        grades: [
          { typeId: 1, code: 'EE-602', grade: 2 },
          { typeId: 2, code: 'EE-604', grade: 4 },
          { typeId: 3, code: 'EE-606', grade: 6 },
        ],
      },
      {
        key: 'High-grade Crystal Alpha',
        name: 'High-grade Crystal Alpha',
        slot: 1,
        grades: [{ typeId: 9, code: null, grade: null }],
      },
    ]);
  });
});

describe('implantEntriesFromMarket', () => {
  it('finds each implant’s slot from its "Implant Slot NN" market-group ancestor', () => {
    const groups = [
      { id: 1, name: 'Implants', parentId: null, hasTypes: false },
      { id: 2, name: 'Implant Slot 06', parentId: 1, hasTypes: false },
      { id: 3, name: 'Engineering', parentId: 2, hasTypes: true },
      { id: 4, name: 'Ship Equipment', parentId: null, hasTypes: true },
    ];
    const types = [
      { typeId: 10, name: "Zainou 'Gypsy' CPU Management EE-605", marketGroupId: 3, volume: 1 },
      { typeId: 11, name: 'Large Shield Extender II', marketGroupId: 4, volume: 1 },
    ];
    expect(implantEntriesFromMarket(types, groups)).toEqual([
      { typeId: 10, name: "Zainou 'Gypsy' CPU Management EE-605", slot: 6 },
    ]);
  });
});

describe('withImplant', () => {
  const slots = new Map([
    [10, 6],
    [20, 7],
    [30, 6],
  ]);
  const slotOf = (typeId: number) => slots.get(typeId);

  it('adds an implant to an empty slot', () => {
    expect(withImplant([20], slotOf, 30)).toEqual([20, 30]);
  });

  it('replaces whatever already sits in that slot — one implant per slot', () => {
    expect(withImplant([10, 20], slotOf, 30)).toEqual([20, 30]);
  });
});

describe('goalGain', () => {
  it('measures a budget goal by the headroom it frees, as a share of the total', () => {
    const cpu = goalById('cpu');
    const before = stats({ cpuUsed: 418.4, cpuTotal: 400 });
    const after = stats({ cpuUsed: 418.4, cpuTotal: 420 });
    expect(goalGain(cpu, before, after)).toBeCloseTo(20 / 400);
  });

  it('measures a "more is better" goal by its relative rise', () => {
    const goal = goalById('damage');
    const before = stats({ offense: { ...stats({}).offense, dps: 400 } });
    const after = stats({ offense: { ...stats({}).offense, dps: 420 } });
    expect(goalGain(goal, before, after)).toBeCloseTo(0.05);
  });

  it('measures a "less is better" goal by its relative fall', () => {
    const goal = goalById('agility');
    const before = stats({ navigation: { maxVelocity: 0, agility: 0.5, mass: 0, warpSpeed: 0 } });
    const after = stats({ navigation: { maxVelocity: 0, agility: 0.45, mass: 0, warpSpeed: 0 } });
    expect(goalGain(goal, before, after)).toBeCloseTo(0.1);
  });

  it('is 0 for a goal the fit has nothing for', () => {
    expect(goalGain(goalById('damage'), stats({}), stats({}))).toBe(0);
  });

  it('has a goal for each fitting budget', () => {
    expect(IMPLANT_GOALS.filter((g) => g.kind === 'budget').map((g) => g.id)).toEqual([
      'cpu',
      'powergrid',
    ]);
  });
});

describe('pickSource', () => {
  it('buys at the selected hub when it has sellers', () => {
    expect(
      pickSource(
        [
          { hubId: 'jita', sellMin: 9e6, sellVolume: 4 },
          { hubId: 'amarr', sellMin: 7e6, sellVolume: 2 },
        ],
        'jita'
      )
    ).toEqual({ hubId: 'jita', price: 9e6, volume: 4, atSelectedHub: true });
  });

  it('falls back to the cheapest other hub when the selected one has none', () => {
    expect(
      pickSource(
        [
          { hubId: 'jita', sellMin: null, sellVolume: 0 },
          { hubId: 'amarr', sellMin: 8e6, sellVolume: 2 },
          { hubId: 'rens', sellMin: 7e6, sellVolume: 1 },
        ],
        'jita'
      )
    ).toEqual({ hubId: 'rens', price: 7e6, volume: 1, atSelectedHub: false });
  });

  it('is null when no hub sells it', () => {
    expect(pickSource([{ hubId: 'jita', sellMin: null, sellVolume: 0 }], 'jita')).toBeNull();
  });
});

describe('cheapestFixes', () => {
  const ee = (grade: number, gain: number, price: number) => ({
    typeId: 600 + grade,
    slot: 6,
    headroomGain: gain,
    price,
  });
  const wu = (grade: number, gain: number, price: number) => ({
    typeId: 1000 + grade,
    slot: 10,
    headroomGain: gain,
    price,
  });

  it('finds a pair across two slots when it is cheaper than one big implant', () => {
    const fixes = cheapestFixes([ee(3, 12, 3e6), ee(5, 20, 21e6), wu(3, 7, 3e6)], 18.4);
    expect(fixes[0]).toEqual({ typeIds: [603, 1003], cost: 6e6, headroomGain: 19 });
  });

  it('never puts two implants in one slot', () => {
    const fixes = cheapestFixes([ee(3, 12, 1e6), ee(4, 16, 1e6)], 20);
    expect(fixes).toEqual([]);
  });

  it('skips an implant nobody sells', () => {
    const fixes = cheapestFixes([ee(5, 20, Number.NaN), ee(6, 24, 60e6)], 18.4);
    expect(fixes.map((f) => f.typeIds)).toEqual([[606]]);
  });

  it('lists every combination that fits, cheapest first', () => {
    const fixes = cheapestFixes([ee(5, 20, 20e6), ee(6, 24, 60e6), wu(6, 5, 70e6)], 18.4);
    expect(fixes.map((f) => f.typeIds)).toEqual([[605], [606], [605, 1006], [606, 1006]]);
  });

  it('drops a grade beaten in its own slot on both price and headroom', () => {
    // EE-606 here is dearer and frees less than EE-605: no fix should ever use it.
    const fixes = cheapestFixes([ee(5, 24, 20e6), ee(6, 20, 60e6)], 18.4);
    expect(fixes.map((f) => f.typeIds)).toEqual([[605]]);
  });

  it('keeps at most the asked-for number of options', () => {
    const fixes = cheapestFixes([ee(5, 20, 20e6), ee(6, 24, 60e6), wu(6, 5, 70e6)], 18.4, 2);
    expect(fixes).toHaveLength(2);
  });
});

describe('keepMoreHeadroom', () => {
  it('keeps a dearer option only when it frees more than every cheaper one', () => {
    const options = [
      { id: 'a', cost: 10, headroom: 2 },
      { id: 'b', cost: 20, headroom: 1.5 },
      { id: 'c', cost: 30, headroom: 5 },
      { id: 'd', cost: 40, headroom: 5 },
    ];
    expect(keepMoreHeadroom(options).map((o) => o.id)).toEqual(['a', 'c']);
  });
});

describe('headroom', () => {
  it('is what is left of a budget, negative when over', () => {
    expect(headroom({ used: 418.4, total: 400 })).toBeCloseTo(-18.4);
    expect(headroom({ used: 380, total: 400 })).toBe(20);
  });
});
