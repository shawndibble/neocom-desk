import { describe, expect, it } from 'vitest';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { characterFlyGap } from './characterFlyGap';
import { computeSkillGaps } from './skillGaps';
import type { Fitting } from './types';

const skill = (typeID: number, prereqs: { typeID: number; level: number }[] = []): EngineSkill => ({
  typeID,
  name: `S${typeID}`,
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs,
});
const skills = new Map([
  [100, skill(100)],
  [200, skill(200, [{ typeID: 100, level: 3 }])],
]);
const fitting: Fitting = {
  name: 'T',
  shipTypeId: 1,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 10, state: 'active' }],
  drones: [],
  cargo: [],
};
const requirements = new Map([[10, [{ skillTypeID: 200, level: 2 }]]]);
const attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

function gapFor(trained: Map<number, TrainedSkill>) {
  const levels = new Map([...trained].map(([id, s]) => [id, s.level]));
  const { missing } = computeSkillGaps(fitting, requirements, levels);
  const scheduled = scheduleEntries(missing, {
    skills,
    trainedSkills: trained,
    attributes,
    implants: {},
    cloneState: 'omega',
  });
  return { missing, scheduled, gap: characterFlyGap(missing, scheduled) };
}

describe('characterFlyGap', () => {
  it('is empty for a Character with nothing missing', () => {
    const gap = characterFlyGap([], []);
    expect(gap).toEqual({ missingCount: 0, totalSeconds: 0, skills: [] });
  });

  it('counts the same missing skills as the active-Character gaps and totals the schedule', () => {
    const { missing, scheduled, gap } = gapFor(new Map([[100, { level: 3, sp: 0 }]]));
    expect(gap.missingCount).toBe(missing.length);
    expect(gap.missingCount).toBe(1);
    expect(gap.totalSeconds).toBeGreaterThan(0);
    expect(gap.totalSeconds).toBe(scheduled.reduce((sum, s) => sum + s.seconds, 0));
    expect(gap.skills).toHaveLength(1);
    expect(gap.skills[0]).toMatchObject({ skillTypeID: 200, targetLevel: 2, direct: true });
    expect(gap.skills[0].seconds).toBe(gap.totalSeconds);
  });

  it('lists prerequisites the Character lacks, not counted as missing', () => {
    const { missing, gap } = gapFor(new Map());
    expect(missing).toHaveLength(1);
    expect(gap.missingCount).toBe(1);
    const prereq = gap.skills.find((s) => s.skillTypeID === 100);
    expect(prereq).toMatchObject({ targetLevel: 3, direct: false });
    expect(gap.skills.reduce((sum, s) => sum + s.seconds, 0)).toBe(gap.totalSeconds);
  });
});
