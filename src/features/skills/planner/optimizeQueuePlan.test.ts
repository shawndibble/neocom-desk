import { describe, expect, it } from 'vitest';
import type { AttributeName, EngineSkill, PlanEntry } from '@/engine/types';
import type { SkillCatalog } from '@/features/skills/skillMap';
import { optimizeQueuePlan } from './optimizeQueuePlan';
import { schedulePlanWith, type PlanScheduleInputs } from './planSchedule';
import type { RemapAvailability } from './remapAvailability';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const DAY_MS = 86_400_000;

const PAIRS: [AttributeName, AttributeName][] = [
  ['intelligence', 'memory'],
  ['perception', 'willpower'],
  ['charisma', 'willpower'],
  ['intelligence', 'perception'],
];
const SKILLS: EngineSkill[] = PAIRS.map(([primary, secondary], i) => ({
  typeID: i + 1,
  name: `Skill ${i + 1}`,
  rank: 3,
  primary,
  secondary,
  prereqs: [],
  alphaMaxLevel: 5,
}));
const catalog: SkillCatalog = {
  engineSkills: new Map(SKILLS.map((s) => [s.typeID, s])),
  bySkillTypeID: new Map(),
  unlocksByTypeID: new Map(),
};
const inputs: PlanScheduleInputs = {
  catalog,
  trained: new Map(),
  queueEntries: [],
  attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
  attributeBaseline: null,
  implants: {},
  cloneState: 'omega',
};
const entries: PlanEntry[] = SKILLS.map((s) => ({ skillTypeID: s.typeID, targetLevel: 4 }));
const READY: RemapAvailability = { available: 1, bonus: 0, yearlyReady: true, cooldownUntil: null };
const run = (over: Partial<Parameters<typeof optimizeQueuePlan>[0]> = {}) =>
  optimizeQueuePlan({
    entries,
    inputs,
    remapInfo: READY,
    nowMs: NOW,
    characterId: 7,
    name: 'Skill queue',
    ...over,
  });

describe('optimizeQueuePlan', () => {
  it('makes nothing for an empty queue', () => {
    expect(run({ entries: [] })).toEqual({ kind: 'empty' });
  });

  it('makes nothing when no remaps are available to place', () => {
    const none = { ...READY, available: 0, yearlyReady: false, cooldownUntil: null };
    expect(run({ remapInfo: none }).kind).toBe('optimal');
  });

  it('writes a plan whose Remap Marker savings are what the editor shows for it', () => {
    const got = run();
    if (got.kind !== 'plan') throw new Error('expected a plan');
    expect(got.plan).toMatchObject({ characterId: 7, name: 'Skill queue', entries });
    expect(got.plan.markers?.length).toBeGreaterThan(0);
    expect(got.plan.markerAttributes).toEqual([]);
    const editor = schedulePlanWith(got.plan, inputs, NOW).markersResult;
    expect(got.savingsSeconds).toBeGreaterThan(60);
    expect(got.savingsSeconds).toBe(editor?.savingsSeconds);
    expect(got.firstRemapEntry).toBe(got.plan.entries[got.plan.markers![0]!]);
    expect(got.remapsPlaced).toBe(got.plan.markers!.length);
    expect(got.yearlyRemapAfter).toBeUndefined();
  });

  it('keeps a yearly remap on cooldown no earlier than its date and names that date', () => {
    const cooldownUntil = new Date(NOW + 2 * DAY_MS);
    const got = run({
      remapInfo: { available: 0, bonus: 0, yearlyReady: false, cooldownUntil },
    });
    if (got.kind !== 'plan') throw new Error('expected a plan');
    expect(got.yearlyRemapAfter).toEqual(cooldownUntil);
    expect(got.plan.remapCount).toBe(1);
  });

  it('places up to two remaps with bonus remaps', () => {
    const got = run({
      remapInfo: { available: 3, bonus: 2, yearlyReady: true, cooldownUntil: null },
    });
    if (got.kind !== 'plan') throw new Error('expected a plan');
    expect(got.remapsPlaced).toBeLessThanOrEqual(2);
    expect(got.plan.remapCount).toBe(3);
  });
});
