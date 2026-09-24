import { describe, expect, it } from 'vitest';
import { milestoneStates, nextMilestone } from './skillPlanMilestones';
import { stepKey } from './skillPlanSchedule';
import type { PlanMilestone, ScheduledStep, TrainedSkill } from '@/engine/types';

const START = new Date('2026-01-01T00:00:00.000Z');

function step(skillTypeID: number, level: number, cumulativeSeconds: number): ScheduledStep {
  return { skillTypeID, level, sp: 0, seconds: cumulativeSeconds, cumulativeSeconds };
}

function milestone(overrides: Partial<PlanMilestone> = {}): PlanMilestone {
  return { id: 'm1', name: 'Fly Loki', skillTypeID: 100, level: 4, ...overrides };
}

describe('milestoneStates', () => {
  it("projects the anchor step's cumulative finish", () => {
    const stepByKey = new Map([[stepKey({ skillTypeID: 100, level: 4 }), step(100, 4, 3600)]]);
    const [status] = milestoneStates(stepByKey, START, [milestone()], new Map());
    expect(status.state).toBe('projected');
    expect(status.finish).toEqual(new Date(START.getTime() + 3600 * 1000));
  });

  it('survives a reorder — looked up by key, not position', () => {
    // Simulates a schedule recomputed after other entries moved ahead of the
    // milestone's anchor: the map's insertion order changed and the anchor's
    // own cumulativeSeconds grew, but the same StepKey still resolves it.
    const stepByKey = new Map([
      [stepKey({ skillTypeID: 200, level: 1 }), step(200, 1, 1000)],
      [stepKey({ skillTypeID: 100, level: 4 }), step(100, 4, 7200)],
    ]);
    const [status] = milestoneStates(stepByKey, START, [milestone()], new Map());
    expect(status.state).toBe('projected');
    expect(status.finish).toEqual(new Date(START.getTime() + 7200 * 1000));
  });

  it('reads reached once the anchor is gone and the level is already trained', () => {
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 4, sp: 999_999 }]]);
    const [status] = milestoneStates(new Map(), START, [milestone()], trainedSkills);
    expect(status.state).toBe('reached');
    expect(status.finish).toBeNull();
  });

  it('reads orphaned once the anchor is gone and the level was never trained', () => {
    const [status] = milestoneStates(new Map(), START, [milestone()], new Map());
    expect(status.state).toBe('orphaned');
    expect(status.finish).toBeNull();
  });

  it('reads orphaned rather than reached when only a lower level is trained', () => {
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 3, sp: 500_000 }]]);
    const [status] = milestoneStates(new Map(), START, [milestone()], trainedSkills);
    expect(status.state).toBe('orphaned');
  });

  it('orders projected milestones soonest-finish first, reached/orphaned last', () => {
    const stepByKey = new Map([
      [stepKey({ skillTypeID: 100, level: 4 }), step(100, 4, 7200)],
      [stepKey({ skillTypeID: 300, level: 5 }), step(300, 5, 1000)],
    ]);
    const milestones = [
      milestone({ id: 'far', skillTypeID: 100, level: 4 }),
      milestone({ id: 'near', skillTypeID: 300, level: 5 }),
      milestone({ id: 'gone', skillTypeID: 400, level: 1 }),
    ];
    const statuses = milestoneStates(stepByKey, START, milestones, new Map());
    expect(statuses.map((s) => s.milestone.id)).toEqual(['near', 'far', 'gone']);
  });
});

describe('nextMilestone', () => {
  it('skips reached milestones and returns the soonest projected one', () => {
    const stepByKey = new Map([[stepKey({ skillTypeID: 300, level: 5 }), step(300, 5, 1000)]]);
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 4, sp: 999_999 }]]);
    const milestones = [
      milestone({ id: 'reached', skillTypeID: 100, level: 4 }),
      milestone({ id: 'projected', skillTypeID: 300, level: 5 }),
    ];
    const statuses = milestoneStates(stepByKey, START, milestones, trainedSkills);
    expect(nextMilestone(statuses)?.milestone.id).toBe('projected');
  });

  it('returns undefined when nothing is left projected', () => {
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 4, sp: 999_999 }]]);
    const statuses = milestoneStates(new Map(), START, [milestone()], trainedSkills);
    expect(nextMilestone(statuses)).toBeUndefined();
  });
});
