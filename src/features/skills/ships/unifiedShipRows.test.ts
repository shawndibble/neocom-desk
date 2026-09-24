import { describe, expect, it } from 'vitest';
import { mergeShipEntries, tagUnifiedRows } from './unifiedShipRows';
import { buildFitCheckRows } from './fitCheckRows';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPrereq } from '@/sde/types';

function skill(typeID: number, name: string): EngineSkill {
  return { typeID, name, rank: 1, primary: 'intelligence', secondary: 'memory', prereqs: [] };
}

const skills = new Map([
  [100, skill(100, 'Gunnery')],
  [200, skill(200, 'Sharpshooter')],
  [300, skill(300, 'Drone Interfacing')],
]);
const trainedSkills = new Map<number, TrainedSkill>();
const noSchedule: readonly ScheduledStep[] = [];

describe('mergeShipEntries', () => {
  it('a skill only in one Mastery tier: tags that tier, not from fit', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [{ skillTypeID: 100, level: 1 }],
      [],
      [],
      [],
      [],
    ];
    const { entries, highestMasteryTier, fromFit } = mergeShipEntries(tiers, null);
    expect(entries).toEqual([{ skillTypeID: 100, targetLevel: 1 }]);
    expect(highestMasteryTier.get(100)).toBe(0);
    expect(fromFit.has(100)).toBe(false);
  });

  it('a skill in multiple tiers: takes the highest tier index and the max level across tiers', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [{ skillTypeID: 100, level: 1 }],
      [{ skillTypeID: 100, level: 3 }],
      [],
      [],
      [],
    ];
    const { entries, highestMasteryTier } = mergeShipEntries(tiers, null);
    expect(entries).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
    expect(highestMasteryTier.get(100)).toBe(1);
  });

  it('a skill only in the attached fit: from fit, no mastery tier', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [[], [], [], [], []];
    const fitEntries: PlanEntry[] = [{ skillTypeID: 200, targetLevel: 2 }];
    const { entries, highestMasteryTier, fromFit } = mergeShipEntries(tiers, fitEntries);
    expect(entries).toEqual([{ skillTypeID: 200, targetLevel: 2 }]);
    expect(highestMasteryTier.get(200)).toBeUndefined();
    expect(fromFit.has(200)).toBe(true);
  });

  it('same skill from both sources: takes the max level, tagged with both', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [],
      [{ skillTypeID: 100, level: 2 }],
      [],
      [],
      [],
    ];
    const fitEntries: PlanEntry[] = [{ skillTypeID: 100, targetLevel: 4 }];
    const { entries, highestMasteryTier, fromFit } = mergeShipEntries(tiers, fitEntries);
    expect(entries).toEqual([{ skillTypeID: 100, targetLevel: 4 }]);
    expect(highestMasteryTier.get(100)).toBe(1);
    expect(fromFit.has(100)).toBe(true);
  });

  it('a skill required at its final level from tier I onward (cumulative SDE bundles): tags the earliest tier, not the last one it appears in', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
    ];
    const { highestMasteryTier } = mergeShipEntries(tiers, null);
    expect(highestMasteryTier.get(100)).toBe(0);
  });

  it('a skill whose required level rises partway through the cumulative bundles: tags the tier it first reaches its max level', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [{ skillTypeID: 100, level: 1 }],
      [{ skillTypeID: 100, level: 1 }],
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
      [{ skillTypeID: 100, level: 3 }],
    ];
    const { highestMasteryTier } = mergeShipEntries(tiers, null);
    expect(highestMasteryTier.get(100)).toBe(2);
  });

  it('null fitEntries (no fit attached): mastery tiers alone, nothing tagged fromFit', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [
      [{ skillTypeID: 100, level: 1 }],
      [],
      [],
      [],
      [],
    ];
    const { fromFit } = mergeShipEntries(tiers, null);
    expect(fromFit.size).toBe(0);
  });

  it('a ship with no mastery data at all: entries come from the fit alone', () => {
    const tiers: readonly (readonly SkillPrereq[])[] = [[], [], [], [], []];
    const fitEntries: PlanEntry[] = [{ skillTypeID: 300, targetLevel: 1 }];
    const { entries, highestMasteryTier } = mergeShipEntries(tiers, fitEntries);
    expect(entries).toEqual([{ skillTypeID: 300, targetLevel: 1 }]);
    expect(highestMasteryTier.size).toBe(0);
  });
});

describe('tagUnifiedRows', () => {
  it('attaches highestMasteryTier and fromFit onto each FitCheckRow by skillTypeID', () => {
    const entries: PlanEntry[] = [
      { skillTypeID: 100, targetLevel: 3 },
      { skillTypeID: 200, targetLevel: 1 },
    ];
    const rows = buildFitCheckRows(entries, skills, trainedSkills, noSchedule);
    const highestMasteryTier = new Map([[100, 1]]);
    const fromFit = new Set([200]);

    const tagged = tagUnifiedRows(rows, highestMasteryTier, fromFit);

    expect(tagged.find((r) => r.skillTypeID === 100)).toMatchObject({
      highestMasteryTier: 1,
      fromFit: false,
    });
    expect(tagged.find((r) => r.skillTypeID === 200)).toMatchObject({
      highestMasteryTier: null,
      fromFit: true,
    });
  });
});
