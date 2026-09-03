import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadCorrectedSkills = vi.fn();
vi.mock('@/features/skills/correctedSkills', () => ({
  loadCorrectedSkills: (...args: unknown[]) => loadCorrectedSkills(...args),
}));

const {
  CUSTOMS_CODE_EXPERTISE_SKILL_ID,
  COLONY_SPACES,
  customsRateSource,
  defaultCustomsRate,
  highsecCustomsRate,
  loadCustomsCodeExpertise,
} = await import('./customsRate');
type ColonySpace = import('./customsRate').ColonySpace;

beforeEach(() => {
  loadCorrectedSkills.mockReset();
});

describe('highsecCustomsRate', () => {
  it('is the engine default at level 0 and falls one point per level', () => {
    expect(highsecCustomsRate(0)).toBeCloseTo(0.1, 10);
    expect(highsecCustomsRate(1)).toBeCloseTo(0.09, 10);
    expect(highsecCustomsRate(4)).toBeCloseTo(0.06, 10);
    expect(highsecCustomsRate(5)).toBeCloseTo(0.05, 10);
  });

  it('treats an unknown level as untrained rather than guessing a trained one', () => {
    expect(highsecCustomsRate(null)).toBeCloseTo(0.1, 10);
  });

  it('clamps a level outside 0..5 instead of producing a rate the game cannot charge', () => {
    expect(highsecCustomsRate(-3)).toBeCloseTo(0.1, 10);
    expect(highsecCustomsRate(9)).toBeCloseTo(0.05, 10);
  });
});

describe('defaultCustomsRate', () => {
  it('only applies the skill in highsec, where the NPC component exists', () => {
    expect(defaultCustomsRate('highsec', 5)).toBeCloseTo(0.05, 10);
  });

  it('is zero outside highsec, where a player POCO has no NPC component at all', () => {
    for (const space of ['lowsec', 'nullsec', 'wormhole'] as ColonySpace[]) {
      expect(defaultCustomsRate(space, 5)).toBe(0);
      expect(defaultCustomsRate(space, null)).toBe(0);
    }
  });
});

describe('customsRateSource', () => {
  it('distinguishes a known skill level from having no skill data at all', () => {
    expect(customsRateSource('highsec', 4)).toEqual({ kind: 'highsec-skill', level: 4 });
    expect(customsRateSource('highsec', null)).toEqual({ kind: 'highsec-unknown-skill' });
  });

  it('names the band, not the skill, outside highsec', () => {
    expect(customsRateSource('nullsec', 5)).toEqual({ kind: 'player-poco', space: 'nullsec' });
  });
});

describe('COLONY_SPACES', () => {
  it('lists the four bands the picker offers, highsec first', () => {
    expect(COLONY_SPACES).toEqual(['highsec', 'lowsec', 'nullsec', 'wormhole']);
  });
});

describe('CUSTOMS_CODE_EXPERTISE_SKILL_ID', () => {
  it('is the SDE typeID for Customs Code Expertise', () => {
    expect(CUSTOMS_CODE_EXPERTISE_SKILL_ID).toBe(33467);
  });
});

describe('loadCustomsCodeExpertise', () => {
  it('reads the corrected level, so a queue entry the API has not applied still counts', async () => {
    loadCorrectedSkills.mockResolvedValue({
      skillsResult: { data: { skills: [], total_sp: 0 }, fetchedAt: new Date(), fromCache: false },
      trained: new Map([[CUSTOMS_CODE_EXPERTISE_SKILL_ID, { level: 5, sp: 0 }]]),
    });

    expect(await loadCustomsCodeExpertise(91, 0)).toBe(5);
    expect(loadCorrectedSkills).toHaveBeenCalledWith(91, 0, { skipQueueWithoutScope: true });
  });

  it('is a confident 0 when skills loaded and the character has never trained it', async () => {
    loadCorrectedSkills.mockResolvedValue({
      skillsResult: { data: { skills: [], total_sp: 0 }, fetchedAt: new Date(), fromCache: false },
      trained: new Map(),
    });

    expect(await loadCustomsCodeExpertise(91, 0)).toBe(0);
  });

  it('is null — not 0 — when there is no skill data at all to read', async () => {
    loadCorrectedSkills.mockResolvedValue({ skillsResult: null, trained: new Map() });

    expect(await loadCustomsCodeExpertise(91, 0)).toBeNull();
  });
});
