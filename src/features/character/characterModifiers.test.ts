import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCharacterModifiers } from './characterModifiers';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { SKILL_IDS } from '@/engine/industry/types';

vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/features/skills/data', () => ({ loadCharacterImplants: vi.fn() }));

const mockedLoadCorrectedSkills = vi.mocked(loadCorrectedSkills);
const mockedLoadCharacterImplants = vi.mocked(loadCharacterImplants);
const BX_804 = 27171;
const RX_802 = 27169;

function corrected(trained: number, effective: number): CorrectedSkills {
  return {
    skillsResult: null,
    skillsNeedsReauth: false,
    queueResult: null,
    queueNeedsReauth: false,
    completedLevels: new Map(),
    trained: new Map([[SKILL_IDS.industry, { level: trained, sp: 0 }]]),
    effective: new Map([[SKILL_IDS.industry, effective]]),
    completedSp: 0,
    totalSp: null,
    fetchedAt: null,
  };
}

beforeEach(() => {
  mockedLoadCorrectedSkills.mockReset();
  mockedLoadCharacterImplants.mockReset();
  // An alpha-capped clone: trained V, usable IV.
  mockedLoadCorrectedSkills.mockResolvedValue(corrected(5, 4));
  mockedLoadCharacterImplants.mockResolvedValue({
    data: [BX_804, RX_802],
    fetchedAt: new Date(0),
    fromCache: true,
  } as unknown as Awaited<ReturnType<typeof loadCharacterImplants>>);
});

describe('loadCharacterModifiers', () => {
  it('reads queue-corrected trained levels by default', async () => {
    const modifiers = await loadCharacterModifiers(1, 0);
    expect(modifiers.skills[SKILL_IDS.industry]).toBe(5);
  });

  it("reads effective levels when asked — Industry's rule (issue #1236)", async () => {
    const modifiers = await loadCharacterModifiers(1, 0, { levels: 'effective' });
    expect(modifiers.skills[SKILL_IDS.industry]).toBe(4);
  });

  it('resolves the active clone implants', async () => {
    const modifiers = await loadCharacterModifiers(1, 0);
    expect(modifiers.manufacturingTimeImplantPct).toBe(4);
    expect(modifiers.refiningImplantPct).toBe(2);
  });

  it('treats no implant data as nothing fitted', async () => {
    mockedLoadCharacterImplants.mockResolvedValue(null);
    const modifiers = await loadCharacterModifiers(1, 0);
    expect(modifiers.manufacturingTimeImplantPct).toBe(0);
  });

  it('forwards the corrected-skills options, minus its own level choice', async () => {
    await loadCharacterModifiers(7, 123, { skipQueueWithoutScope: true, levels: 'effective' });
    expect(mockedLoadCorrectedSkills).toHaveBeenCalledWith(7, 123, {
      skipQueueWithoutScope: true,
    });
    expect(mockedLoadCharacterImplants).toHaveBeenCalledWith(7);
  });
});
