import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, improveCandidates } from './improve';
import {
  DEFAULT_GOAL_OF_ROLE,
  hullRoleOf,
  rememberedGoal,
  rememberedJob,
  rememberedSpace,
  roleUnlocks,
  type HullRef,
} from './improveRole';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const RETRIEVER: HullRef = { typeId: 17_476, groupId: 463 };
const NESTOR: HullRef = { typeId: 33_472, groupId: 27 };
const DRAKE: HullRef = { typeId: 24_698, groupId: 419 };
const HULK: HullRef = { typeId: 22_544, groupId: 543 };

describe('hullRoleOf', () => {
  it('reads the role from the ship group, or the hull itself for a Nestor or a Venture', () => {
    expect(hullRoleOf(RETRIEVER)).toBe('mining');
    expect(hullRoleOf(HULK)).toBe('mining');
    expect(hullRoleOf({ typeId: 32_880, groupId: 25 })).toBe('mining');
    expect(hullRoleOf(NESTOR)).toBe('logistics');
    expect(hullRoleOf({ typeId: 11_978, groupId: 832 })).toBe('logistics');
    expect(hullRoleOf({ typeId: 22_474, groupId: 540 })).toBe('command');
    expect(hullRoleOf({ typeId: 28_606, groupId: 941 })).toBe('command');
    expect(hullRoleOf({ typeId: 20_187, groupId: 513 })).toBe('hauling');
    expect(hullRoleOf(DRAKE)).toBe('combat');
    expect(hullRoleOf(undefined)).toBe('combat');
  });
});

describe('goalAvailability by hull role', () => {
  const blank = baseFittingStats();

  it('offers Mine more on a blank mining hull, not on a blank combat hull', () => {
    expect(goalAvailability('mining', blank)).toEqual({ available: false, reason: 'noMiners' });
    expect(goalAvailability('mining', blank, RETRIEVER)).toEqual({ available: true });
    expect(goalAvailability('mining', blank, DRAKE)).toEqual({
      available: false,
      reason: 'noMiners',
    });
  });

  it('offers Repair more and Transfer more on a Nestor with empty highs', () => {
    expect(goalAvailability('repair', blank, NESTOR)).toEqual({ available: true });
    expect(goalAvailability('transfer', blank, NESTOR)).toEqual({ available: true });
    expect(goalAvailability('mining', blank, NESTOR).available).toBe(false);
  });

  it('keeps a fit-based unlock on any hull', () => {
    const armed = { ...blank, offense: { ...blank.offense, dps: 100 } } as FittingStats;
    expect(goalAvailability('damage', armed, RETRIEVER)).toEqual({ available: true });
  });

  it('lists what each role unlocks', () => {
    expect(roleUnlocks('mining')).toEqual(['mining']);
    expect(roleUnlocks('logistics')).toEqual(['repair', 'transfer']);
    expect(roleUnlocks('combat')).toEqual([]);
  });
});

describe('rememberedGoal', () => {
  it('keeps one goal per role and falls back to the role default', () => {
    const byRole = { combat: 'damage' } as const;
    expect(rememberedGoal(byRole, 'overall', 'combat')).toBe('damage');
    expect(rememberedGoal(byRole, 'overall', 'mining')).toBe(DEFAULT_GOAL_OF_ROLE.mining);
    expect(DEFAULT_GOAL_OF_ROLE).toEqual({
      combat: 'overall',
      explorer: 'explore',
      mining: 'mining',
      logistics: 'repair',
      command: 'command',
      hauling: 'haul',
    });
  });

  it('uses the old global goal once, where no role has one yet and it suits the role', () => {
    expect(rememberedGoal({}, 'damage', 'combat')).toBe('damage');
    expect(rememberedGoal({}, 'damage', 'mining')).toBe('mining');
    expect(rememberedGoal({}, 'mining', 'mining')).toBe('mining');
    expect(rememberedGoal({ mining: 'mining' }, 'damage', 'combat')).toBe('overall');
  });
});

describe('a blank hull ranks fills by absolute gain', () => {
  const MINER_ROW = { isDrone: false, count: 1, cycleSeconds: 60, perCycle: 0, wastePerSecond: 0 };
  const minerStats = (perSecond: number): FittingStats =>
    ({
      ...baseFittingStats(),
      mining: {
        rows: perSecond > 0 ? [{ ...MINER_ROW, typeId: 1, perSecond }] : [],
        perSecond,
        perHour: perSecond * 3600,
        wastePerSecond: 0,
        wastePct: 0,
      },
    }) as unknown as FittingStats;
  const blankFit = { shipTypeId: 17_476, name: 'Retriever', modules: [] } as unknown as Fitting;
  const yields: Record<number, number> = { 10: 4, 11: 9, 12: 1 };

  it('puts the strip miner fill first on a blank Retriever', async () => {
    const index = buildVariationIndex({}, {});
    const candidates = improveCandidates(
      [],
      index,
      { '10': 'high', '11': 'high', '12': 'high' },
      {
        goal: 'mining',
        slotCounts: { high: 2, medium: 0, low: 0, rig: 0, subsystem: 0 },
        pool: {
          groupOf: () => 464,
          typeIdsInGroup: (group) => (group === 464 ? [10, 11, 12] : []),
          published: () => true,
        },
      }
    );
    expect(candidates).toHaveLength(3);
    const result = await findImprovements({
      fitting: blankFit,
      before: minerStats(0),
      goal: 'mining',
      candidates,
      stats: async (f) => minerStats(yields[f.modules[0]!.typeId]!),
      priceOf: () => null,
    });
    expect(result!.noDownside.map((o) => o.candidate.toTypeId)).toEqual([11, 10, 12]);
  });
});

describe('a Nestor with empty highs', () => {
  it('fills the first empty high with remote repairers for Repair more', () => {
    const index = buildVariationIndex({}, {});
    const candidates = improveCandidates(
      [],
      index,
      { '20': 'high', '21': 'high' },
      {
        goal: 'repair',
        slotCounts: { high: 5, medium: 0, low: 0, rig: 0, subsystem: 0 },
        pool: {
          groupOf: () => 325,
          typeIdsInGroup: (group) => (group === 325 ? [20, 21] : []),
          published: () => true,
        },
      }
    );
    expect(candidates.map((c) => [c.toTypeId, c.at[0]!.slotIndex])).toEqual([
      [20, 0],
      [21, 0],
    ]);
  });
});

describe('explorer hulls and the Job per role', () => {
  const ASTERO: HullRef = { typeId: 33_468, groupId: 25 };

  it('names the explorer hulls by type id', () => {
    for (const typeId of [605, 607, 29_248, 586, 33_468, 11_192, 11_182, 11_172, 11_188, 33_470])
      expect(hullRoleOf({ typeId, groupId: 25 })).toBe('explorer');
  });

  it('opens an Astero on Explore and a Drake on PvE', () => {
    expect(rememberedJob({}, 'pve', hullRoleOf(ASTERO))).toBe('explore');
    expect(rememberedJob({}, 'pve', hullRoleOf(DRAKE))).toBe('pve');
  });

  it('remembers PvP for combat hulls while explorers keep their own', () => {
    const byRole = { combat: 'pvp' } as const;
    expect(rememberedJob(byRole, 'pve', 'combat')).toBe('pvp');
    expect(rememberedJob(byRole, 'pve', 'explorer')).toBe('explore');
    expect(rememberedJob({ ...byRole, explorer: 'pve' }, 'pve', 'explorer')).toBe('pve');
  });

  it('uses the old device-wide Job once, only while no role has one, it was moved, and it suits the role', () => {
    expect(rememberedJob({}, 'pvp', 'combat')).toBe('pvp');
    expect(rememberedJob({ combat: 'pve' }, 'pvp', 'mining')).toBe('pve');
    // Explore set on an Astero must not open a Drake on Explore, nor PvP an Astero on PvP.
    expect(rememberedJob({}, 'explore', 'combat')).toBe('pve');
    expect(rememberedJob({}, 'explore', 'explorer')).toBe('explore');
    expect(rememberedJob({}, 'pvp', 'explorer')).toBe('explore');
  });

  it('remembers the Explore space per role the same way', () => {
    expect(rememberedSpace({}, 'dangerous', 'explorer')).toBe('dangerous');
    expect(rememberedSpace({}, 'safe', 'explorer')).toBe('safe');
    expect(rememberedSpace({ explorer: 'dangerous' }, 'safe', 'explorer')).toBe('dangerous');
    expect(rememberedSpace({ combat: 'safe' }, 'safe', 'explorer')).toBe('dangerous');
  });
});
