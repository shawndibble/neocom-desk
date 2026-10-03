import { describe, expect, it } from 'vitest';
import { buildVariationIndex } from '../market/variations';
import {
  applyModuleUpgrade,
  moduleUpgradeCandidates,
  raisedSkillLevels,
  scheduleTimeFor,
  unmetRequirements,
} from './moduleUpgrades';
import type { Fitting, FittingModule } from './types';

const RAILGUN_I = 574;
const RAILGUN_II = 3090;
const RAILGUN_COMPACT = 7447;
const RAILGUN_FACTION = 13878;
const CCC_I = 25948;
const CCC_II = 26374;
const AB_I = 12066;
const AB_ENDURING = 5955;
const AB_II = 12068;
const BATTERY_I = 2020;
const BATTERY_FACTION = 41218;

const index = buildVariationIndex(
  {
    [RAILGUN_I]: { parentTypeId: null, metaGroupId: 1 },
    [RAILGUN_II]: { parentTypeId: RAILGUN_I, metaGroupId: 2 },
    [RAILGUN_COMPACT]: { parentTypeId: RAILGUN_I, metaGroupId: 1 },
    [RAILGUN_FACTION]: { parentTypeId: RAILGUN_I, metaGroupId: 4 },
    [CCC_I]: { parentTypeId: null, metaGroupId: 1 },
    [CCC_II]: { parentTypeId: CCC_I, metaGroupId: 2 },
    [AB_I]: { parentTypeId: null, metaGroupId: 1 },
    [AB_ENDURING]: { parentTypeId: AB_I, metaGroupId: 1 },
    [AB_II]: { parentTypeId: AB_I, metaGroupId: 2 },
    [BATTERY_I]: { parentTypeId: null, metaGroupId: 1 },
    [BATTERY_FACTION]: { parentTypeId: BATTERY_I, metaGroupId: 4 },
  },
  { 1: 'Tech I', 2: 'Tech II', 4: 'Faction' }
);

const rackOf = {
  [RAILGUN_I]: 'high',
  [RAILGUN_II]: 'high',
  [RAILGUN_COMPACT]: 'high',
  [RAILGUN_FACTION]: 'high',
  [CCC_I]: 'rig',
  [CCC_II]: 'rig',
  [AB_I]: 'medium',
  [AB_ENDURING]: 'medium',
  [AB_II]: 'medium',
  [BATTERY_I]: 'medium',
  [BATTERY_FACTION]: 'medium',
} as const;

function module(
  slot: FittingModule['slot'],
  slotIndex: number,
  typeId: number,
  chargeTypeId?: number
): FittingModule {
  return { slot, slotIndex, typeId, state: 'active', ...(chargeTypeId ? { chargeTypeId } : {}) };
}

const ANTIMATTER_L = 238;

function rokh(): Fitting {
  return {
    name: 'Boom',
    shipTypeId: 24688,
    modules: [
      module('high', 0, RAILGUN_I, ANTIMATTER_L),
      module('high', 1, RAILGUN_I, ANTIMATTER_L),
      module('high', 2, RAILGUN_FACTION, ANTIMATTER_L),
      module('medium', 0, AB_ENDURING),
      module('medium', 1, BATTERY_FACTION),
      module('rig', 0, CCC_II),
      module('rig', 1, CCC_I),
    ],
    drones: [],
    cargo: [],
  } as unknown as Fitting;
}

describe('moduleUpgradeCandidates', () => {
  it('pairs each fitted Tech I or meta module with its Tech II sibling, every copy together, in fit order', () => {
    expect(moduleUpgradeCandidates(rokh().modules, index, rackOf)).toEqual([
      {
        fromTypeId: RAILGUN_I,
        toTypeId: RAILGUN_II,
        at: [
          { slot: 'high', slotIndex: 0 },
          { slot: 'high', slotIndex: 1 },
        ],
      },
      { fromTypeId: AB_ENDURING, toTypeId: AB_II, at: [{ slot: 'medium', slotIndex: 0 }] },
      { fromTypeId: CCC_I, toTypeId: CCC_II, at: [{ slot: 'rig', slotIndex: 1 }] },
    ]);
  });

  it('never offers a Tech II for a faction, officer or Tech II module, nor one with no Tech II', () => {
    const fromIds = moduleUpgradeCandidates(rokh().modules, index, rackOf).map((u) => u.fromTypeId);
    expect(fromIds).not.toContain(RAILGUN_FACTION);
    expect(fromIds).not.toContain(BATTERY_FACTION);
    expect(fromIds).not.toContain(CCC_II);
  });

  it('skips a Tech II that goes in another rack, or a module the variation data lacks', () => {
    const modules = [module('high', 0, RAILGUN_I), module('high', 1, 999_999)];
    expect(moduleUpgradeCandidates(modules, index, { ...rackOf, [RAILGUN_II]: 'medium' })).toEqual(
      []
    );
  });
});

describe('applyModuleUpgrade', () => {
  it('swaps every copy, keeping each one state and charge, and leaves the rest alone', () => {
    const fit = rokh();
    const [railguns] = moduleUpgradeCandidates(fit.modules, index, rackOf);
    const upgraded = applyModuleUpgrade(fit, railguns!);
    expect(upgraded.modules.map((m) => m.typeId)).toEqual([
      RAILGUN_II,
      RAILGUN_II,
      RAILGUN_FACTION,
      AB_ENDURING,
      BATTERY_FACTION,
      CCC_II,
      CCC_I,
    ]);
    expect(upgraded.modules[0]).toEqual(module('high', 0, RAILGUN_II, ANTIMATTER_L));
    expect(fit.modules[0]!.typeId).toBe(RAILGUN_I);
  });
});

describe('unmetRequirements', () => {
  it('keeps the requirements the pilot has below the level asked', () => {
    const levels = new Map([
      [3307, 5],
      [12207, 0],
    ]);
    expect(
      unmetRequirements(
        [
          { skillTypeID: 3307, targetLevel: 5 },
          { skillTypeID: 12207, targetLevel: 1 },
          { skillTypeID: 3300, targetLevel: 1 },
        ],
        levels
      )
    ).toEqual([
      { skillTypeID: 12207, targetLevel: 1 },
      { skillTypeID: 3300, targetLevel: 1 },
    ]);
  });
});

describe('raisedSkillLevels', () => {
  it('raises each skill to its target, never lowering one the pilot has higher', () => {
    const levels = new Map([
      [3307, 3],
      [3300, 5],
    ]);
    const raised = raisedSkillLevels(levels, [
      { skillTypeID: 3307, targetLevel: 5 },
      { skillTypeID: 3300, targetLevel: 2 },
      { skillTypeID: 12207, targetLevel: 1 },
    ]);
    expect([...raised]).toEqual([
      [3307, 5],
      [3300, 5],
      [12207, 1],
    ]);
    expect(levels.get(3307)).toBe(3);
  });
});

describe('scheduleTimeFor', () => {
  it('totals the schedule, and flags a skill trained on the way to the ones asked for', () => {
    const scheduled = [
      { skillTypeID: 3307, level: 4, seconds: 100 },
      { skillTypeID: 3307, level: 5, seconds: 500 },
      { skillTypeID: 12207, level: 1, seconds: 50 },
    ];
    expect(scheduleTimeFor(scheduled, [12207])).toEqual({
      seconds: 650,
      includesPrerequisites: true,
    });
    expect(scheduleTimeFor(scheduled, [3307, 12207])).toEqual({
      seconds: 650,
      includesPrerequisites: false,
    });
  });
});
