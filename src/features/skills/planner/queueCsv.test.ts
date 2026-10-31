import { describe, it, expect } from 'vitest';
import { queueCsvColumns, queueCsvRows, type QueueCsvContext } from './queueCsv';
import { toCsv } from '@/lib/csv';
import type { EngineSkill, ScheduledStep } from '@/engine/types';

const identityT = (k: string) => k;
const nameFor = (skillTypeID: number) => `Skill #${skillTypeID}`;

const steps: ScheduledStep[] = [
  { skillTypeID: 1, level: 4, sp: 256000, seconds: 3600, cumulativeSeconds: 3600 },
  { skillTypeID: 2, level: 1, sp: 250, seconds: 300, cumulativeSeconds: 3900 },
];

const START = new Date('2026-10-01T00:00:00Z');
const skill = (typeID: number): EngineSkill => ({
  typeID,
  name: `Skill #${typeID}`,
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
});

const context: QueueCsvContext = {
  schedule: {
    scheduled: steps,
    startDate: START,
    markerStepIndices: [1],
    boostedSteps: new Set([0]),
    alphaCappedSteps: new Set([1]),
    priorityMap: new Map([[1, 'high']]),
  },
  engineSkills: new Map([
    [1, skill(1)],
    [2, skill(2)],
  ]),
};

const rows = queueCsvRows({ scheduled: steps, isKnownSkill: (id) => id !== 99 }, [], new Map());

function valuesOf(row: (typeof rows)[number], user: ReadonlySet<number> = new Set()) {
  return Object.fromEntries(
    queueCsvColumns(identityT, nameFor, user, context).map((c) => [c.header, c.value(row)])
  );
}

describe('queueCsvRows', () => {
  it('lists the scheduled steps, then entries the schedule leaves out with a status', () => {
    const result = queueCsvRows(
      { scheduled: steps, isKnownSkill: (id) => id !== 99 },
      [
        { skillTypeID: 1, targetLevel: 4 }, // scheduled already
        { skillTypeID: 5, targetLevel: 3 }, // trained
        { skillTypeID: 6, targetLevel: 2 }, // ahead in the live queue
        { skillTypeID: 99, targetLevel: 1 }, // unknown
      ],
      new Map([[5, { level: 4, sp: 1 }]])
    );
    expect(result.map((r) => [r.skillTypeID, r.level, r.status])).toEqual([
      [1, 4, 'scheduled'],
      [2, 1, 'scheduled'],
      [5, 3, 'trained'],
      [6, 2, 'queued'],
      [99, 1, 'unknown'],
    ]);
  });
});

describe('queueCsvColumns', () => {
  it('orders the headers', () => {
    expect(queueCsvColumns(identityT, nameFor, new Set(), context).map((c) => c.header)).toEqual([
      'plans.csvSkill',
      'plans.csvLevel',
      'plans.csvStatus',
      'plans.csvSeconds',
      'plans.csvCumulativeSeconds',
      'plans.csvStart',
      'plans.csvDoneBy',
      'plans.csvSp',
      'plans.csvPriority',
      'plans.csvPrimaryAttribute',
      'plans.csvSecondaryAttribute',
      'plans.csvBoosted',
      'plans.csvAlphaCapped',
      'plans.csvRemapBefore',
      'plans.csvPrereq',
    ]);
  });

  it('emits skill, raw level, seconds, cumulative seconds and per-step SP as numbers', () => {
    expect(valuesOf(rows[0])).toMatchObject({
      'plans.csvSkill': 'Skill #1',
      'plans.csvLevel': 4,
      'plans.csvSeconds': 3600,
      'plans.csvCumulativeSeconds': 3600,
      'plans.csvSp': 256000,
      'plans.csvStatus': 'plans.csvStatusScheduled',
    });
  });

  it('dates each step from the plan start: start and done-by', () => {
    expect(valuesOf(rows[1])).toMatchObject({
      'plans.csvStart': '2026-10-01T01:00:00.000Z',
      'plans.csvDoneBy': '2026-10-01T01:05:00.000Z',
    });
  });

  it('carries priority, attributes and the booster, alpha and remap flags', () => {
    expect(valuesOf(rows[0])).toMatchObject({
      'plans.csvPriority': 'plans.priorityHigh',
      'plans.csvPrimaryAttribute': 'skills.attr.perception',
      'plans.csvSecondaryAttribute': 'skills.attr.willpower',
      'plans.csvBoosted': 'plans.csvYes',
      'plans.csvAlphaCapped': 'plans.csvNo',
      'plans.csvRemapBefore': 'plans.csvNo',
    });
    expect(valuesOf(rows[1])).toMatchObject({
      'plans.csvBoosted': 'plans.csvNo',
      'plans.csvAlphaCapped': 'plans.csvYes',
      'plans.csvRemapBefore': 'plans.csvYes',
    });
  });

  it('marks a step absent from userSkillTypeIDs as a prerequisite, present as not', () => {
    expect(valuesOf(rows[0])['plans.csvPrereq']).toBe('plans.csvYes');
    expect(valuesOf(rows[0], new Set([1]))['plans.csvPrereq']).toBe('plans.csvNo');
  });

  it('leaves time and flags blank for an entry with no step, and marks it by status', () => {
    const [unknown] = queueCsvRows(
      { scheduled: [], isKnownSkill: () => false },
      [{ skillTypeID: 99, targetLevel: 2 }],
      new Map()
    );
    expect(valuesOf(unknown)).toMatchObject({
      'plans.csvStatus': 'plans.csvStatusUnknown',
      'plans.csvSeconds': undefined,
      'plans.csvDoneBy': undefined,
      'plans.csvBoosted': undefined,
      'plans.csvPriority': undefined,
    });
  });

  it('produces raw numeric cells in the rendered CSV, not localized strings', () => {
    const csv = toCsv(rows, queueCsvColumns(identityT, nameFor, new Set([1]), context));
    expect(csv).toContain('3600');
    expect(csv).not.toContain('3,600');
  });
});
