import { describe, expect, it } from 'vitest';
import {
  dropCoveredRows,
  masteryRowSortValue,
  mergeShipEntries,
  nextUnmetMasteryTier,
  tagUnifiedRows,
} from './unifiedShipRows';
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

describe('masteryRowSortValue', () => {
  it('a trained row: undefined regardless of tier, so sortRows sinks it last', () => {
    expect(
      masteryRowSortValue({ status: 'trained', seconds: 0, highestMasteryTier: 3 })
    ).toBeUndefined();
  });

  it('tier ordering beats training time: a tier I row with huge seconds still sorts before a tier IV row with tiny seconds', () => {
    const tierI = masteryRowSortValue({
      status: 'partial',
      seconds: 999_999_999,
      highestMasteryTier: 0,
    });
    const tierIV = masteryRowSortValue({ status: 'partial', seconds: 1, highestMasteryTier: 3 });
    expect(tierI).toBeLessThan(tierIV!);
  });

  it('within the same tier: shorter training time sorts first', () => {
    const shorter = masteryRowSortValue({ status: 'partial', seconds: 100, highestMasteryTier: 1 });
    const longer = masteryRowSortValue({ status: 'partial', seconds: 200, highestMasteryTier: 1 });
    expect(shorter).toBeLessThan(longer!);
  });

  it('a fit-only row (no mastery tier): sorts after every tiered row', () => {
    const tierV = masteryRowSortValue({
      status: 'partial',
      seconds: 999_999_999,
      highestMasteryTier: 4,
    });
    const fitOnly = masteryRowSortValue({
      status: 'partial',
      seconds: 1,
      highestMasteryTier: null,
    });
    expect(fitOnly).toBeGreaterThan(tierV!);
  });
});

describe('nextUnmetMasteryTier', () => {
  const tiers: SkillPrereq[][] = [
    [{ skillTypeID: 100, level: 1 }],
    [{ skillTypeID: 100, level: 2 }],
    [{ skillTypeID: 200, level: 3 }],
    [],
    [],
  ];

  it('returns the first tier with an unmet skill', () => {
    const levels = new Map([[100, 1]]);
    expect(nextUnmetMasteryTier(tiers, (id) => levels.get(id) ?? 0)).toBe(1);
  });

  it('returns null once every tier is met', () => {
    const levels = new Map([
      [100, 5],
      [200, 5],
    ]);
    expect(nextUnmetMasteryTier(tiers, (id) => levels.get(id) ?? 0)).toBeNull();
  });
});

describe('dropCoveredRows', () => {
  it('drops rows the required group already asks for at that level or higher, keeps higher targets', () => {
    const rows = [
      { skillTypeID: 100, targetLevel: 3 },
      { skillTypeID: 200, targetLevel: 5 },
      { skillTypeID: 300, targetLevel: 1 },
    ];
    const required: PlanEntry[] = [
      { skillTypeID: 100, targetLevel: 4 },
      { skillTypeID: 200, targetLevel: 4 },
    ];
    expect(dropCoveredRows(rows, required)).toEqual([
      { skillTypeID: 200, targetLevel: 5 },
      { skillTypeID: 300, targetLevel: 1 },
    ]);
  });
});
