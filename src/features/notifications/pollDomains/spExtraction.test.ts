import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
  useSpFarmCharacters,
} from '@/features/character/spExtractionSettings';
import { loadCharacterSkillsWithStatus } from '@/features/skills/data';
import { spExtractionDomain } from './spExtraction';

vi.mock('@/features/skills/data', () => ({ loadCharacterSkillsWithStatus: vi.fn() }));

const MARKED = 11;
const UNMARKED = 22;

beforeEach(async () => {
  await db.settings.clear();
  useSpExtractionMonitoringEnabled.setState({ value: false, hydrated: false });
  useSpExtractionThresholdSp.setState({ value: 500_000, hydrated: false });
  useSpFarmCharacters.setState({ value: [], hydrated: false });
  vi.mocked(loadCharacterSkillsWithStatus).mockReset();
  vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue({
    needsReauth: false,
    cached: { data: { total_sp: 60_000_000 } },
  } as never);
});

describe('spExtractionDomain.load', () => {
  it('reads nothing for an unmarked character, even with monitoring on', async () => {
    await useSpExtractionMonitoringEnabled.getState().setValue(true);
    await useSpFarmCharacters.getState().setValue([MARKED]);
    expect(await spExtractionDomain.load(UNMARKED)).toBeNull();
    expect(loadCharacterSkillsWithStatus).not.toHaveBeenCalled();
  });

  it('reads nothing when no character is marked', async () => {
    await useSpExtractionMonitoringEnabled.getState().setValue(true);
    expect(await spExtractionDomain.load(MARKED)).toBeNull();
  });

  it('reads a marked character', async () => {
    await useSpExtractionMonitoringEnabled.getState().setValue(true);
    await useSpFarmCharacters.getState().setValue([MARKED]);
    expect(await spExtractionDomain.load(MARKED)).toEqual([
      { totalSp: 60_000_000, thresholdSp: 500_000 },
    ]);
  });

  it('reads nothing for a marked character while monitoring is off', async () => {
    await useSpFarmCharacters.getState().setValue([MARKED]);
    expect(await spExtractionDomain.load(MARKED)).toBeNull();
  });
});
