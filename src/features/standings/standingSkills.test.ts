import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_IDS } from '@/engine/industry/types';
import { SOCIAL_SKILL_IDS } from '@/engine/standings';
import { loadStandingSkills, standingSkillsFrom } from './standingSkills';

const mocks = vi.hoisted(() => ({ corrected: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: mocks.corrected }));

const read = (trained: [number, number][], effective: [number, number][]) => ({
  skillsResult: {},
  trained: new Map(trained.map(([id, level]) => [id, { level, sp: 0 }])),
  effective: new Map(effective),
});

describe('standingSkillsFrom', () => {
  it('reads the social skills from the usable (effective) levels and Broker Relations from the trained one', () => {
    const skills = standingSkillsFrom(
      read(
        [[SKILL_IDS.brokerRelations, 4]],
        [
          [SOCIAL_SKILL_IDS.connections, 5],
          [SOCIAL_SKILL_IDS.criminalConnections, 3],
          [SOCIAL_SKILL_IDS.diplomacy, 2],
        ]
      ) as never
    );
    expect(skills).toEqual({
      social: { connections: 5, criminalConnections: 3, diplomacy: 2 },
      brokerRelationsLevel: 4,
    });
  });

  it('reads an untrained skill as level 0', () => {
    expect(standingSkillsFrom(read([], []) as never)).toEqual({
      social: { connections: 0, criminalConnections: 0, diplomacy: 0 },
      brokerRelationsLevel: 0,
    });
  });

  it('is null while the pilot skills are unknown, never a made-up all-zero', () => {
    expect(standingSkillsFrom({ ...read([], []), skillsResult: null } as never)).toBeNull();
  });
});

describe('loadStandingSkills', () => {
  beforeEach(() => mocks.corrected.mockReset());

  it('reads through the queue-corrected skills without asking for the queue scope', async () => {
    mocks.corrected.mockResolvedValue(read([], [[SOCIAL_SKILL_IDS.diplomacy, 1]]));
    const skills = await loadStandingSkills(7, 123);
    expect(skills?.social.diplomacy).toBe(1);
    expect(mocks.corrected).toHaveBeenCalledWith(7, 123, { skipQueueWithoutScope: true });
  });
});
