import { describe, it, expect } from 'vitest';
import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import { jobSlotSkillsFromCharacterSkills } from './jobSlotSkills';

function skill(skillId: number, activeLevel: number): CharacterSkill {
  return {
    skill_id: skillId,
    trained_skill_level: activeLevel,
    active_skill_level: activeLevel,
    skillpoints_in_skill: 0,
  };
}

describe('jobSlotSkillsFromCharacterSkills', () => {
  it('defaults every field to 0 when none of the six skills are present', () => {
    expect(jobSlotSkillsFromCharacterSkills([])).toEqual({
      massProduction: 0,
      advancedMassProduction: 0,
      laboratoryOperation: 0,
      advancedLaboratoryOperation: 0,
      massReactions: 0,
      advancedMassReactions: 0,
    });
  });

  it('reads each of the six by its real EVE type id', () => {
    const skills = [
      skill(3387, 5), // Mass Production
      skill(24625, 4), // Advanced Mass Production
      skill(3406, 3), // Laboratory Operation
      skill(24624, 2), // Advanced Laboratory Operation
      skill(45748, 4), // Mass Reactions
      skill(45749, 0), // Advanced Mass Reactions (untrained, present at 0)
      skill(3300, 5), // an unrelated skill — must not leak into any field
    ];
    expect(jobSlotSkillsFromCharacterSkills(skills)).toEqual({
      massProduction: 5,
      advancedMassProduction: 4,
      laboratoryOperation: 3,
      advancedLaboratoryOperation: 2,
      massReactions: 4,
      advancedMassReactions: 0,
    });
  });

  it('follows active_skill_level, not trained_skill_level, when the two differ (e.g. an Alpha clone)', () => {
    const skills = [
      { skill_id: 3387, trained_skill_level: 5, active_skill_level: 3, skillpoints_in_skill: 0 },
    ];
    expect(jobSlotSkillsFromCharacterSkills(skills).massProduction).toBe(3);
  });

  it('counts a queue entry finished in the past even though /skills has not caught up yet (issue #1236)', () => {
    const skills = [
      { skill_id: 3387, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 0 },
    ];
    const queue: SkillQueueEntry[] = [
      {
        skill_id: 3387,
        queue_position: 0,
        finished_level: 5,
        finish_date: '2026-08-29T12:00:00Z',
      } as SkillQueueEntry,
    ];
    const nowMs = Date.parse('2026-08-30T12:00:00Z');
    expect(jobSlotSkillsFromCharacterSkills(skills, queue, nowMs).massProduction).toBe(5);
  });
});
