import { describe, expect, it } from 'vitest';
import { buildMasteryTierRow } from './masteryRows';
import type { EngineSkill, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPrereq } from '@/sde/types';

function skill(typeID: number, name: string): EngineSkill {
  return { typeID, name, rank: 1, primary: 'intelligence', secondary: 'memory', prereqs: [] };
}

function step(skillTypeID: number, level: number, seconds: number): ScheduledStep {
  return { skillTypeID, level, sp: 0, seconds, cumulativeSeconds: seconds };
}

describe('buildMasteryTierRow', () => {
  const skills = new Map([
    [100, skill(100, 'Gunnery')],
    [200, skill(200, 'Spaceship Command')],
  ]);

  it('is complete with zero total seconds when every skill in the bundle is already trained', () => {
    const bundle: SkillPrereq[] = [{ skillTypeID: 100, level: 2 }];
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 3, sp: 1000 }]]);

    const tierRow = buildMasteryTierRow(0, bundle, skills, trainedSkills, []);

    expect(tierRow).toEqual({
      tier: 0,
      rows: [
        {
          skillTypeID: 100,
          name: 'Gunnery',
          currentLevel: 3,
          targetLevel: 2,
          status: 'trained',
          seconds: 0,
        },
      ],
      complete: true,
      totalSeconds: 0,
    });
  });

  it('is incomplete with the summed remaining time when part of the bundle is untrained', () => {
    const bundle: SkillPrereq[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 200, level: 2 },
    ];
    const trainedSkills = new Map<number, TrainedSkill>([[100, { level: 1, sp: 100 }]]);
    const scheduled = [step(200, 1, 300), step(200, 2, 400)];

    const tierRow = buildMasteryTierRow(2, bundle, skills, trainedSkills, scheduled);

    expect(tierRow.tier).toBe(2);
    expect(tierRow.complete).toBe(false);
    expect(tierRow.totalSeconds).toBe(700);
    expect(tierRow.rows.map((r) => r.status)).toEqual(['trained', 'missing']);
  });

  it('treats a level-0 bundle entry as trivially satisfied — a tier can list a skill before it is actually required', () => {
    const bundle: SkillPrereq[] = [{ skillTypeID: 100, level: 0 }];

    const tierRow = buildMasteryTierRow(0, bundle, skills, new Map(), []);

    expect(tierRow.rows[0].status).toBe('trained');
    expect(tierRow.complete).toBe(true);
    expect(tierRow.totalSeconds).toBe(0);
  });

  it('is vacuously complete for an empty bundle', () => {
    const tierRow = buildMasteryTierRow(4, [], skills, new Map(), []);
    expect(tierRow).toEqual({ tier: 4, rows: [], complete: true, totalSeconds: 0 });
  });
});
