import { describe, expect, it } from 'vitest';
import { buildFitCheckRows } from './fitCheckRows';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';

function skill(typeID: number, name: string): EngineSkill {
  return { typeID, name, rank: 1, primary: 'intelligence', secondary: 'memory', prereqs: [] };
}

function step(skillTypeID: number, level: number, seconds: number): ScheduledStep {
  return { skillTypeID, level, sp: 0, seconds, cumulativeSeconds: seconds };
}

describe('buildFitCheckRows', () => {
  const skills = new Map([
    [100, skill(100, 'Gunnery')],
    [200, skill(200, 'Sharpshooter')],
    [300, skill(300, 'Drone Interfacing')],
  ]);

  it('marks a skill never trained as missing, with its full training time', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 100, targetLevel: 4 }];
    const trainedSkills = new Map<number, TrainedSkill>();
    const scheduled = [step(100, 1, 100), step(100, 2, 200), step(100, 3, 300), step(100, 4, 400)];

    const rows = buildFitCheckRows(entries, skills, trainedSkills, scheduled);

    expect(rows).toEqual([
      {
        skillTypeID: 100,
        name: 'Gunnery',
        currentLevel: 0,
        targetLevel: 4,
        status: 'missing',
        seconds: 1000,
      },
    ]);
  });

  it('marks a partially-trained skill as partial, with only the remaining time', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 200, targetLevel: 3 }];
    const trainedSkills = new Map<number, TrainedSkill>([[200, { level: 2, sp: 1000 }]]);
    const scheduled = [step(200, 3, 500)];

    const rows = buildFitCheckRows(entries, skills, trainedSkills, scheduled);

    expect(rows).toEqual([
      {
        skillTypeID: 200,
        name: 'Sharpshooter',
        currentLevel: 2,
        targetLevel: 3,
        status: 'partial',
        seconds: 500,
      },
    ]);
  });

  it('marks an already-trained skill as trained, with zero time, even if it has no scheduled steps', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 300, targetLevel: 2 }];
    const trainedSkills = new Map<number, TrainedSkill>([[300, { level: 3, sp: 5000 }]]);

    const rows = buildFitCheckRows(entries, skills, trainedSkills, []);

    expect(rows).toEqual([
      {
        skillTypeID: 300,
        name: 'Drone Interfacing',
        currentLevel: 3,
        targetLevel: 2,
        status: 'trained',
        seconds: 0,
      },
    ]);
  });

  it('falls back to a typeID placeholder name for a skill missing from the catalog', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 999, targetLevel: 1 }];
    const rows = buildFitCheckRows(entries, skills, new Map(), []);
    expect(rows[0].name).toBe('#999');
  });

  it('preserves entry order', () => {
    const entries: PlanEntry[] = [
      { skillTypeID: 300, targetLevel: 1 },
      { skillTypeID: 100, targetLevel: 1 },
    ];
    const rows = buildFitCheckRows(entries, skills, new Map(), []);
    expect(rows.map((r) => r.skillTypeID)).toEqual([300, 100]);
  });
});
