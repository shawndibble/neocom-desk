import { describe, expect, it } from 'vitest';
import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import { effectiveSkillLevels, effectiveSkillLevelsFromTrained } from './effectiveSkillLevels';

const NOW = Date.parse('2026-08-30T12:00:00Z');

function skill(skillId: number, trained: number, active: number): CharacterSkill {
  return {
    skill_id: skillId,
    trained_skill_level: trained,
    active_skill_level: active,
    skillpoints_in_skill: 0,
  };
}

describe('effectiveSkillLevels', () => {
  it('raises both trained and active together for a queue entry finished in the past', () => {
    const skills = [skill(3300, 3, 3)];
    const queue: SkillQueueEntry[] = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 4,
        finish_date: '2026-08-29T12:00:00Z',
      } as SkillQueueEntry,
    ];
    expect(effectiveSkillLevels(skills, queue, NOW).get(3300)).toBe(4);
  });

  it('caps at the active level when it reads below trained, with no queue movement', () => {
    const skills = [skill(3300, 5, 2)];
    expect(effectiveSkillLevels(skills, [], NOW).get(3300)).toBe(2);
  });

  it('defaults an absent skill to 0', () => {
    expect(effectiveSkillLevels([], [], NOW).get(3300)).toBeUndefined();
  });
});

describe('effectiveSkillLevelsFromTrained', () => {
  it('takes an already-built trained map instead of rebuilding it, and agrees with effectiveSkillLevels', () => {
    const skills = [skill(3300, 5, 2)];
    const trained = new Map([[3300, { level: 5, sp: 0 }]]);
    expect(effectiveSkillLevelsFromTrained(trained, skills, [], NOW).get(3300)).toBe(
      effectiveSkillLevels(skills, [], NOW).get(3300)
    );
  });
});
