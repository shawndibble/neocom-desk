import { describe, expect, it, vi } from 'vitest';
import { findSkillFixes } from './skillFixes';
import type { PlanEntry } from '../types';
import type { FittingStats } from './types';

function stats(cpuUsed: number, powergridUsed = 0): FittingStats {
  return {
    cpuUsed,
    cpuTotal: 100,
    powergridUsed,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
  } as unknown as FittingStats;
}

/**
 * Each skill frees `perLevel[skill]` CPU per level trained above `from`.
 * The pilot's own levels are `from`; `trained` raises them.
 */
function cpuModel(base: number, perLevel: Record<number, number>, from: Record<number, number>) {
  return vi.fn(async (trained: readonly PlanEntry[]) => {
    let cpu = base;
    for (const { skillTypeID, targetLevel } of trained) {
      cpu -= (perLevel[skillTypeID] ?? 0) * Math.max(0, targetLevel - (from[skillTypeID] ?? 0));
    }
    return stats(cpu);
  });
}

describe('findSkillFixes', () => {
  it('finds nothing to fix on a fit within budget, without calculating', async () => {
    const calc = cpuModel(90, { 1: 5 }, {});
    const fixes = await findSkillFixes({
      before: stats(90),
      candidates: [{ skillTypeId: 1, fromLevel: 0 }],
      stats: calc,
    });
    expect(fixes).toEqual([]);
    expect(calc).not.toHaveBeenCalled();
  });

  it('offers the lowest level of one skill that brings the fit under', async () => {
    // 148 CPU of 100: skill 1 frees 12/level from I → needs IV (−48).
    const calc = cpuModel(148, { 1: 12 }, { 1: 0 });
    const fixes = await findSkillFixes({
      before: stats(148),
      candidates: [{ skillTypeId: 1, fromLevel: 0 }],
      stats: calc,
    });
    expect(fixes.map((fix) => fix.entries)).toEqual([[{ skillTypeID: 1, targetLevel: 4 }]]);
    expect(fixes[0]!.after.cpuUsed).toBe(100);
  });

  it('builds on the level the pilot already has', async () => {
    const calc = cpuModel(110, { 1: 6 }, { 1: 2 });
    const fixes = await findSkillFixes({
      before: stats(110),
      candidates: [{ skillTypeId: 1, fromLevel: 2 }],
      stats: calc,
    });
    expect(fixes.map((fix) => fix.entries)).toEqual([[{ skillTypeID: 1, targetLevel: 4 }]]);
  });

  it('leaves out a skill that cannot fix it alone or does nothing, and one at V', async () => {
    const calc = cpuModel(150, { 1: 12, 2: 2, 3: 0, 4: 20 }, { 4: 5 });
    const fixes = await findSkillFixes({
      before: stats(150),
      candidates: [
        { skillTypeId: 1, fromLevel: 0 },
        { skillTypeId: 3, fromLevel: 0 },
        { skillTypeId: 4, fromLevel: 5 },
      ],
      stats: calc,
    });
    // 1 at V frees 60 → fits; 3 frees nothing; 4 is already V.
    expect(fixes.map((fix) => fix.entries)).toEqual([[{ skillTypeID: 1, targetLevel: 5 }]]);
  });

  it('combines skills when none fixes it alone, at the lowest levels that still fit', async () => {
    // 160 CPU: 1 frees 8/level (40 at V), 2 frees 5/level (25 at V) — 60 needed.
    const calc = cpuModel(160, { 1: 8, 2: 5 }, {});
    const fixes = await findSkillFixes({
      before: stats(160),
      candidates: [
        { skillTypeId: 1, fromLevel: 0 },
        { skillTypeId: 2, fromLevel: 0 },
      ],
      stats: calc,
    });
    expect(fixes).toHaveLength(1);
    // 1 lowered first while 2 sits at V: 25 + 8×5 = 65 ≥ 60, 8×4 = 57 short → 1 stays V; then 2: 40 + 5×4 = 60 → IV.
    expect(fixes[0]!.entries).toEqual([
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 4 },
    ]);
    expect(fixes[0]!.after.cpuUsed).toBeLessThanOrEqual(100);
  });

  it('offers nothing when even every helpful skill at V together falls short', async () => {
    const calc = cpuModel(200, { 1: 8, 2: 5 }, {});
    const fixes = await findSkillFixes({
      before: stats(200),
      candidates: [
        { skillTypeId: 1, fromLevel: 0 },
        { skillTypeId: 2, fromLevel: 0 },
      ],
      stats: calc,
    });
    expect(fixes).toEqual([]);
  });

  it('never takes a skill that makes another budget worse', async () => {
    const calc = vi.fn(async (trained: readonly PlanEntry[]) =>
      trained.length > 0 ? stats(90, 120) : stats(120, 90)
    );
    const fixes = await findSkillFixes({
      before: stats(120, 90),
      candidates: [{ skillTypeId: 1, fromLevel: 0 }],
      stats: calc,
    });
    expect(fixes).toEqual([]);
  });

  it('stops, returning nothing, once cancelled', async () => {
    let cancelled = false;
    const calc = vi.fn(async () => {
      cancelled = true;
      return stats(90);
    });
    const fixes = await findSkillFixes({
      before: stats(120),
      candidates: [
        { skillTypeId: 1, fromLevel: 0 },
        { skillTypeId: 2, fromLevel: 0 },
      ],
      stats: calc,
      isCancelled: () => cancelled,
    });
    expect(fixes).toEqual([]);
    expect(calc).toHaveBeenCalledTimes(1);
  });

  it('leaves out a skill whose calculation throws', async () => {
    const calc = vi.fn(async (trained: readonly PlanEntry[]) => {
      if (trained[0]?.skillTypeID === 1) throw new Error('boom');
      return stats(95);
    });
    const fixes = await findSkillFixes({
      before: stats(120),
      candidates: [
        { skillTypeId: 1, fromLevel: 0 },
        { skillTypeId: 2, fromLevel: 0 },
      ],
      stats: calc,
    });
    expect(fixes.map((fix) => fix.entries[0]!.skillTypeID)).toEqual([2]);
  });
});
