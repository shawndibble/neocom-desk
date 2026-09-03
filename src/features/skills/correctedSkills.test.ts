import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { db } from '@/db';

vi.mock('./data', () => ({
  loadCharacterSkillsWithStatus: vi.fn(),
  loadCharacterSkillQueueWithStatus: vi.fn(),
}));

const { loadCharacterSkillsWithStatus, loadCharacterSkillQueueWithStatus } = await import('./data');
const { loadCorrectedSkills } = await import('./correctedSkills');

const NOW = Date.parse('2026-08-30T12:00:00Z');
const CHAR_ID = 91;

function skillsStatus(
  over: Partial<CachedResult<CharacterSkills>> & { data: CharacterSkills },
  needsReauth = false
): StatusResult<CharacterSkills> {
  return {
    cached: { fetchedAt: new Date(NOW), fromCache: false, truncated: false, ...over },
    needsReauth,
  };
}

function queueStatus(
  over: Partial<CachedResult<SkillQueueEntry[]>> & { data: SkillQueueEntry[] },
  needsReauth = false
): StatusResult<SkillQueueEntry[]> {
  return {
    cached: { fetchedAt: new Date(NOW), fromCache: false, truncated: false, ...over },
    needsReauth,
  };
}

beforeEach(async () => {
  vi.mocked(loadCharacterSkillsWithStatus).mockReset();
  vi.mocked(loadCharacterSkillQueueWithStatus).mockReset();
  await db.tokens.clear();
});

describe('loadCorrectedSkills', () => {
  it('raises a level and total_sp for a queue entry finished in the past, which /skills has not caught up to', async () => {
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
      skillsStatus({
        data: {
          skills: [
            {
              skill_id: 3300,
              trained_skill_level: 3,
              active_skill_level: 3,
              skillpoints_in_skill: 8000,
            },
          ],
          total_sp: 264_000,
          unallocated_sp: 0,
        },
      })
    );
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({
        data: [
          {
            skill_id: 3300,
            queue_position: 0,
            finished_level: 4,
            finish_date: '2026-08-29T12:00:00Z',
            level_end_sp: 45_255,
          } as SkillQueueEntry,
        ],
      })
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.trained.get(3300)).toEqual({ level: 4, sp: 45_255 });
    expect(result.completedLevels.get(3300)).toEqual({ level: 4, sp: 45_255 });
    expect(result.completedSp).toBe(37_255);
    expect(result.totalSp).toBe(301_255);
  });

  it('interpolates the in-progress level SP that /skills has frozen at training start', async () => {
    // The "Coherent Ore Processing IV: plan 2d 2h, game 1d 9h" report. ESI's
    // /skills reports the SP as of the last apply, so a skill half-way
    // through a level still reads as if it had just begun, and the planner
    // charges the whole level again.
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
      skillsStatus({
        data: {
          skills: [
            {
              skill_id: 60_378,
              trained_skill_level: 3,
              active_skill_level: 3,
              skillpoints_in_skill: 48_000,
            },
          ],
          total_sp: 48_000,
          unallocated_sp: 0,
        },
      })
    );
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({
        data: [
          {
            skill_id: 60_378,
            queue_position: 0,
            finished_level: 4,
            start_date: '2026-08-30T00:00:00Z',
            finish_date: '2026-08-31T00:00:00Z',
            training_start_sp: 48_000,
            level_end_sp: 271_530,
          } as SkillQueueEntry,
        ],
      })
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    // Half-way through the window: 48,000 + (271,530 - 48,000)/2.
    expect(result.trained.get(60_378)).toEqual({ level: 3, sp: 159_765 });
    // The level is not raised — that entry has not finished — and total_sp
    // still reports only what completed levels credit, as it always has.
    expect(result.completedLevels.size).toBe(0);
    expect(result.totalSp).toBe(48_000);
  });

  it('adds a skill /skills omits entirely, keeping its nullable SP in provenance but a usable 0 in the merged map', async () => {
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
      skillsStatus({ data: { skills: [], total_sp: 0, unallocated_sp: 0 } })
    );
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({
        data: [
          {
            skill_id: 1337,
            queue_position: 0,
            finished_level: 1,
            finish_date: '2026-08-29T12:00:00Z',
          } as SkillQueueEntry,
        ],
      })
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.completedLevels.get(1337)).toEqual({ level: 1, sp: null });
    expect(result.trained.get(1337)).toEqual({ level: 1, sp: 0 });
  });

  it('never treats a paused queue entry (no finish_date) as complete', async () => {
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
      skillsStatus({
        data: {
          skills: [
            {
              skill_id: 1,
              trained_skill_level: 2,
              active_skill_level: 2,
              skillpoints_in_skill: 1000,
            },
          ],
          total_sp: 1000,
          unallocated_sp: 0,
        },
      })
    );
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({
        data: [{ skill_id: 1, queue_position: 0, finished_level: 5 } as SkillQueueEntry],
      })
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.completedLevels.size).toBe(0);
    expect(result.trained.get(1)).toEqual({ level: 2, sp: 1000 });
    expect(result.totalSp).toBe(1000);
  });

  it('reports fetchedAt as the older of the skills and queue fetch times', async () => {
    const older = new Date(NOW - 60_000);
    const newer = new Date(NOW);
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
      skillsStatus({ data: { skills: [], total_sp: 0, unallocated_sp: 0 }, fetchedAt: newer })
    );
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({ data: [], fetchedAt: older })
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.fetchedAt).toEqual(older);
  });

  it('reports totalSp and fetchedAt as null when /skills has no cached data at all', async () => {
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue({
      cached: null,
      needsReauth: false,
    });
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue({
      cached: null,
      needsReauth: false,
    });

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.totalSp).toBeNull();
    expect(result.fetchedAt).toBeNull();
    expect(result.trained.size).toBe(0);
  });

  it('passes through skillsNeedsReauth and queueNeedsReauth independently', async () => {
    vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue({ cached: null, needsReauth: true });
    vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(
      queueStatus({ data: [] }, false)
    );

    const result = await loadCorrectedSkills(CHAR_ID, NOW);

    expect(result.skillsNeedsReauth).toBe(true);
    expect(result.queueNeedsReauth).toBe(false);
  });

  describe('skipQueueWithoutScope', () => {
    const QUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';

    beforeEach(() => {
      vi.mocked(loadCharacterSkillsWithStatus).mockResolvedValue(
        skillsStatus({
          data: {
            skills: [
              {
                skill_id: 3300,
                trained_skill_level: 3,
                active_skill_level: 3,
                skillpoints_in_skill: 8000,
              },
            ],
            total_sp: 264_000,
            unallocated_sp: 0,
          },
        })
      );
    });

    it('skips the /skillqueue read entirely and reports no reauth when the character has no queue scope', async () => {
      await db.tokens.put({
        characterId: CHAR_ID,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: NOW + 1_000,
        scopes: ['esi-skills.read_skills.v1'],
      });

      const result = await loadCorrectedSkills(CHAR_ID, NOW, { skipQueueWithoutScope: true });

      expect(loadCharacterSkillQueueWithStatus).not.toHaveBeenCalled();
      expect(result.queueResult).toBeNull();
      expect(result.queueNeedsReauth).toBe(false);
      expect(result.trained.get(3300)).toEqual({ level: 3, sp: 8000 });
    });

    it('skips the /skillqueue read when there is no token row at all', async () => {
      const result = await loadCorrectedSkills(CHAR_ID, NOW, { skipQueueWithoutScope: true });

      expect(loadCharacterSkillQueueWithStatus).not.toHaveBeenCalled();
      expect(result.queueNeedsReauth).toBe(false);
    });

    it('still reads the /skillqueue when the scope is granted', async () => {
      await db.tokens.put({
        characterId: CHAR_ID,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: NOW + 1_000,
        scopes: [QUEUE_SCOPE],
      });
      vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(queueStatus({ data: [] }));

      const result = await loadCorrectedSkills(CHAR_ID, NOW, { skipQueueWithoutScope: true });

      expect(loadCharacterSkillQueueWithStatus).toHaveBeenCalledWith(CHAR_ID);
      expect(result.queueResult).not.toBeNull();
    });

    it('reads the /skillqueue by default, without the option, even absent a token row', async () => {
      vi.mocked(loadCharacterSkillQueueWithStatus).mockResolvedValue(queueStatus({ data: [] }));

      await loadCorrectedSkills(CHAR_ID, NOW);

      expect(loadCharacterSkillQueueWithStatus).toHaveBeenCalledWith(CHAR_ID);
    });
  });
});
