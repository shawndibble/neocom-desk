import { describe, expect, it } from 'vitest';
import { computeSkillPlanSchedule } from '@/engine/skillPlanSchedule';
import type { Attributes, EngineSkill, PlanEntry } from '@/engine/types';
import type { SkillCatalog } from '@/features/skills/skillMap';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { schedulePlan, type PlanScheduleInputs } from './planSchedule';

const A: EngineSkill = {
  typeID: 10,
  name: 'A',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
  alphaMaxLevel: 5,
};
const B: EngineSkill = { ...A, typeID: 20, name: 'B' };
const catalog: SkillCatalog = {
  engineSkills: new Map([A, B].map((s) => [s.typeID, s])),
  bySkillTypeID: new Map(),
  unlocksByTypeID: new Map(),
};
const ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 20,
};
const NOW = Date.parse('2026-09-23T12:00:00Z');
const entry = (skillTypeID: number, targetLevel: number) =>
  ({ skillTypeID, targetLevel }) as PlanEntry;

function inputs(overrides: Partial<PlanScheduleInputs> = {}): PlanScheduleInputs {
  return {
    catalog,
    trained: new Map(),
    queueEntries: [],
    attributes: ATTRIBUTES,
    attributeBaseline: null,
    implants: {},
    cloneState: 'omega',
    ...overrides,
  };
}

const queued = (finishMs: number): SkillQueueEntry => ({
  skill_id: 10,
  queue_position: 0,
  finished_level: 1,
  start_date: new Date(NOW - 3_600_000).toISOString(),
  finish_date: new Date(finishMs).toISOString(),
  level_start_sp: 0,
  level_end_sp: 250,
  training_start_sp: 0,
});

describe('schedulePlan', () => {
  it('costs the plan with its Booster and Remap Marker, as the editor does', () => {
    const plan = {
      entries: [entry(10, 2), entry(20, 2)],
      markers: [1],
      markerAttributes: [null],
      booster: { enabled: true, bonus: 5, startsAt: null, expiresAt: NOW + 30 * 86_400_000 },
    };
    const got = schedulePlan(plan, inputs(), NOW);
    const bare = schedulePlan({ ...plan, booster: undefined }, inputs(), NOW);
    const expected = computeSkillPlanSchedule({
      entries: plan.entries,
      skills: catalog.engineSkills,
      trainedSkills: new Map(),
      attributes: ATTRIBUTES,
      implants: {},
      boosters: [
        {
          bonus: {
            intelligence: 5,
            memory: 5,
            perception: 5,
            willpower: 5,
            charisma: 5,
          },
          expiresAt: new Date(plan.booster.expiresAt),
        },
      ],
      markers: [1],
      markerAttributes: [null],
      cloneState: 'omega',
      startDate: new Date(NOW),
    });
    expect(got.finish).toEqual(expected.finish);
    expect(got.totalSeconds).toBe(expected.totalSeconds);
    expect(got.totalSeconds).toBeLessThan(bare.totalSeconds);
  });

  it('starts where the live queue ends and counts queued levels as trained', () => {
    const queueEnd = NOW + 2 * 3_600_000;
    const s = schedulePlan(
      { entries: [entry(10, 2)] },
      inputs({ queueEntries: [queued(queueEnd)] }),
      NOW
    );
    expect(s.startDate.getTime()).toBe(queueEnd);
    expect(s.scheduled.map((step) => `${step.skillTypeID}:${step.level}`)).toEqual(['10:2']);
  });
});
