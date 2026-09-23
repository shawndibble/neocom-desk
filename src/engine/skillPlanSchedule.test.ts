import { describe, expect, it } from 'vitest';
import { computeSchedule } from '@/engine/schedule';
import { normalizePlan } from '@/engine/plan';
import {
  computeSkillPlanSchedule,
  stepKey,
  type SkillPlanScheduleInput,
} from './skillPlanSchedule';
import type { Attributes, EngineSkill, PlanEntry } from '@/engine/types';

// A: intelligence/memory, fully Alpha-trainable. B: perception/willpower, not
// Alpha-trainable at all. C needs A II. X and Y need each other.
const A: EngineSkill = {
  typeID: 10,
  name: 'A',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
  alphaMaxLevel: 5,
};
const B: EngineSkill = {
  typeID: 20,
  name: 'B',
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
};
const C: EngineSkill = {
  typeID: 30,
  name: 'C',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [{ typeID: 10, level: 2 }],
  alphaMaxLevel: 5,
};
const X: EngineSkill = {
  typeID: 40,
  name: 'X',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [{ typeID: 41, level: 1 }],
};
const Y: EngineSkill = {
  typeID: 41,
  name: 'Y',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [{ typeID: 40, level: 1 }],
};
const SKILLS = new Map([A, B, C, X, Y].map((s) => [s.typeID, s]));
const UNKNOWN = 999;

// 20 + 20/2 = 30 SP/min on every pair: a level I (250 SP) takes 500s.
const ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 20,
};
const START = new Date('2026-01-01T00:00:00Z');

const entry = (skillTypeID: number, targetLevel = 1, priority?: PlanEntry['priority']) =>
  ({ skillTypeID, targetLevel, ...(priority ? { priority } : {}) }) as PlanEntry;

function input(overrides: Partial<SkillPlanScheduleInput> = {}): SkillPlanScheduleInput {
  return {
    entries: [entry(10), entry(20)],
    skills: SKILLS,
    trainedSkills: new Map(),
    attributes: ATTRIBUTES,
    implants: {},
    boosters: [],
    markers: undefined,
    markerAttributes: [],
    cloneState: 'omega',
    startDate: START,
    ...overrides,
  };
}

describe('computeSkillPlanSchedule', () => {
  describe('totals agree with the scheduled steps', () => {
    it('reads total, finish and skill count off the same scheduled steps', () => {
      const s = computeSkillPlanSchedule(input({ entries: [entry(30)] }));
      // C pulls in A I and A II ahead of itself.
      expect(s.scheduled.map(stepKey)).toEqual(['10:1', '10:2', '30:1']);
      expect(s.totalSeconds).toBe(s.scheduled[s.scheduled.length - 1].cumulativeSeconds);
      expect(s.finish).toEqual(new Date(START.getTime() + s.totalSeconds * 1000));
      // Distinct skills scheduled — the injected prereq counts, it is timed too.
      expect(s.skillCount).toBe(2);
      expect(s.startDate).toBe(START);
      expect(s.error).toBeNull();
    });

    it('projects no finish for a plan with nothing left to train', () => {
      const s = computeSkillPlanSchedule(
        input({ entries: [entry(10)], trainedSkills: new Map([[10, { level: 1, sp: 250 }]]) })
      );
      expect(s.scheduled).toEqual([]);
      expect(s.totalSeconds).toBe(0);
      expect(s.finish).toBeNull();
      expect(s.skillCount).toBe(0);
    });

    it("credits the SP already sunk into the first step's level", () => {
      const s = computeSkillPlanSchedule(
        input({ entries: [entry(10)], trainedSkills: new Map([[10, { level: 0, sp: 125 }]]) })
      );
      expect(s.totalSeconds).toBe(250);
    });
  });

  describe('Remap Marker segments', () => {
    const override: Attributes = {
      intelligence: 19,
      memory: 19,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };

    it('costs the plan total per marker segment, from the same segments the savings badge reads (#1232)', () => {
      const s = computeSkillPlanSchedule(input({ markers: [1], markerAttributes: [override] }));
      // A on the flat 30 SP/min -> 500s; B on 27 + 21/2 = 37.5 SP/min -> 400s.
      expect(s.totalSeconds).toBe(900);
      expect(s.markerStepIndices).toEqual([1]);
      expect(s.markersResult).not.toBeNull();

      const segments = s.markersResult!.segments.map((seg) => ({
        startIndex: seg.startIndex,
        attributes: seg.attributes,
      }));
      expect(segments).toContainEqual({ startIndex: 1, attributes: override });
      expect(s.scheduled).toEqual(
        computeSchedule(
          normalizePlan([entry(10), entry(20)], SKILLS),
          { attributes: ATTRIBUTES, startDate: START, trainedSkills: new Map(), segments },
          SKILLS
        )
      );
    });

    it('has no marker result, and trains flat, without markers', () => {
      const s = computeSkillPlanSchedule(input());
      expect(s.markersResult).toBeNull();
      expect(s.markerStepIndices).toEqual([]);
      expect(s.totalSeconds).toBe(1000);
    });
  });

  describe('Clone State', () => {
    it('trains an Alpha clone at half speed', () => {
      const omega = computeSkillPlanSchedule(input());
      const alpha = computeSkillPlanSchedule(input({ cloneState: 'alpha' }));
      expect(alpha.totalSeconds).toBe(omega.totalSeconds * 2);
      expect(alpha.finish).toEqual(new Date(START.getTime() + alpha.totalSeconds * 1000));
    });

    it("flags the steps past an Alpha clone's cap, only for an Alpha clone", () => {
      const alpha = computeSkillPlanSchedule(input({ cloneState: 'alpha' }));
      expect([...alpha.alphaCappedSteps]).toEqual([1]);
      expect(alpha.scheduled[1].skillTypeID).toBe(20);
      expect(computeSkillPlanSchedule(input()).alphaCappedSteps.size).toBe(0);
    });
  });

  describe('Booster', () => {
    it('marks only the steps it raises an attribute for, only with a Booster', () => {
      const boosted = computeSkillPlanSchedule(
        input({
          boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date('2027-01-01T00:00:00Z') }],
        })
      );
      expect([...boosted.boostedSteps]).toEqual([0]);
      // 30 + 10 on intelligence: A trains at 40 SP/min.
      expect(boosted.scheduled[0].seconds).toBe(375);
      expect(computeSkillPlanSchedule(input()).boostedSteps.size).toBe(0);
    });
  });

  describe('skills missing from the catalog', () => {
    it('drops them once, everywhere, without throwing', () => {
      const s = computeSkillPlanSchedule(
        input({ entries: [entry(UNKNOWN), entry(10), entry(20, 1, 'high')], markers: [2] })
      );
      expect(s.error).toBeNull();
      expect(s.scheduled.map(stepKey)).toEqual(['10:1', '20:1']);
      // One boundary per *known* entry.
      expect(s.entryBoundaries).toEqual([1, 2]);
      expect(s.isKnownSkill(UNKNOWN)).toBe(false);
      expect(s.isKnownSkill(10)).toBe(true);
      expect(s.priorityMap.has(UNKNOWN)).toBe(false);
      expect(s.priorityMap.get(20)).toBe('high');
      // Marker positions still address the raw entry list: before entries[2]
      // is after A I, the unknown entry contributing nothing.
      expect(s.markerStepIndices).toEqual([1]);
    });
  });

  describe('a plan the normalizer rejects', () => {
    it('reports the error with an empty schedule, but still knows each entry priority', () => {
      const s = computeSkillPlanSchedule(input({ entries: [entry(40, 1, 'low')], markers: [1] }));
      expect(s.error).toMatch(/Circular/);
      expect(s.scheduled).toEqual([]);
      expect(s.entryBoundaries).toEqual([]);
      expect(s.totalSeconds).toBe(0);
      expect(s.finish).toBeNull();
      expect(s.markersResult).toBeNull();
      expect(s.markerStepIndices).toEqual([]);
      expect(s.priorityMap.get(40)).toBe('low');
    });
  });

  describe('priority', () => {
    it('lets a prerequisite inherit the priority of what needs it', () => {
      const s = computeSkillPlanSchedule(
        input({ entries: [entry(10, 1, 'low'), entry(30, 1, 'high')] })
      );
      expect(s.priorityMap.get(10)).toBe('high');
      expect(s.priorityMap.get(30)).toBe('high');
    });
  });

  describe('step keys', () => {
    it('identifies a step by skill and level, whatever its position', () => {
      const before = computeSkillPlanSchedule(input());
      const after = computeSkillPlanSchedule(input({ entries: [entry(20), entry(10)] }));
      expect(before.stepKeys).toEqual(['10:1', '20:1']);
      expect(after.stepKeys).toEqual(['20:1', '10:1']);
      expect(after.stepByKey.get('10:1')).toEqual(
        expect.objectContaining({ skillTypeID: 10, level: 1 })
      );
    });

    it('misses a step the plan no longer trains instead of resolving to another one', () => {
      const removed = computeSkillPlanSchedule(input({ entries: [entry(20)] }));
      expect(removed.stepByKey.get('10:1')).toBeUndefined();
      expect(removed.stepByKey.get(stepKey({ skillTypeID: 20, level: 1 }))).toBe(
        removed.scheduled[0]
      );
    });
  });
});
