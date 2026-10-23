import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicCharacterInfo } from './publicInfoData';

const loadPublicCharacterInfo = vi.fn<(id: number) => Promise<PublicCharacterInfo | null>>();
vi.mock('./publicInfoData', () => ({
  loadPublicCharacterInfo: (id: number) => loadPublicCharacterInfo(id),
}));

const {
  achievementContactIds,
  achievementFromPublicInfo,
  achievementParts,
  loadCharacterAchievement,
} = await import('./achievement');

const TITLE_ID = '0c231769-621e-53d5-bd49-ce07a7b4a544';
const TITLES = { [TITLE_ID]: 'Selenologist' };

function info(fields: Partial<PublicCharacterInfo>): PublicCharacterInfo {
  return {
    character_id: 2120000001,
    name: 'Mira Calloway',
    corporation_id: 98100001,
    birthday: '2014-03-11T09:12:00Z',
    bloodline_id: 1,
    gender: 'female',
    race_id: 1,
    ...fields,
  };
}

describe('achievementFromPublicInfo', () => {
  it('reads the score and the title id', () => {
    expect(
      achievementFromPublicInfo(info({ achievement_score: 1240, character_title_id: TITLE_ID }))
    ).toEqual({ score: 1240, titleId: TITLE_ID });
  });

  it('reads an absent score as 0 and an absent title as none', () => {
    expect(achievementFromPublicInfo(info({}))).toEqual({ score: 0, titleId: null });
  });
});

describe('achievementParts', () => {
  it('is null with a score of 0 and no title', () => {
    expect(achievementParts({ score: 0, titleId: null }, TITLES)).toBeNull();
  });

  it('is the title and the score when both are set', () => {
    expect(achievementParts({ score: 1240, titleId: TITLE_ID }, TITLES)).toEqual({
      title: 'Selenologist',
      score: 1240,
    });
  });

  it('is the title alone with a score of 0', () => {
    expect(achievementParts({ score: 0, titleId: TITLE_ID }, TITLES)).toEqual({
      title: 'Selenologist',
      score: null,
    });
  });

  it('is the score alone with no title', () => {
    expect(achievementParts({ score: 85, titleId: null }, TITLES)).toEqual({
      title: null,
      score: 85,
    });
  });

  it('drops a title id the baked table does not name', () => {
    expect(achievementParts({ score: 85, titleId: 'unknown-uuid' }, TITLES)).toEqual({
      title: null,
      score: 85,
    });
    expect(achievementParts({ score: 0, titleId: 'unknown-uuid' }, TITLES)).toBeNull();
  });

  it('drops the title until the table has loaded', () => {
    expect(achievementParts({ score: 0, titleId: TITLE_ID }, null)).toBeNull();
  });
});

describe('loadCharacterAchievement', () => {
  beforeEach(() => loadPublicCharacterInfo.mockReset());

  it("reads a player Character's public record", async () => {
    loadPublicCharacterInfo.mockResolvedValue(
      info({ achievement_score: 140, character_title_id: TITLE_ID })
    );
    await expect(loadCharacterAchievement(2120000001)).resolves.toEqual({
      score: 140,
      titleId: TITLE_ID,
    });
    expect(loadPublicCharacterInfo).toHaveBeenCalledWith(2120000001);
  });

  it('never asks ESI about an NPC agent', async () => {
    await expect(loadCharacterAchievement(3_008_416)).resolves.toBeNull();
    expect(loadPublicCharacterInfo).not.toHaveBeenCalled();
  });

  it('is null when the record cannot be read', async () => {
    loadPublicCharacterInfo.mockResolvedValue(null);
    await expect(loadCharacterAchievement(2120000001)).resolves.toBeNull();
  });

  it('is null when the read fails', async () => {
    loadPublicCharacterInfo.mockRejectedValueOnce(new Error('offline'));
    await expect(loadCharacterAchievement(2120000001)).resolves.toBeNull();
  });
});

describe('achievementContactIds', () => {
  it('keeps player Character contacts only: no corporations, alliances, factions or NPC agents', () => {
    expect(
      achievementContactIds([
        { contact_id: 2120000001, contact_type: 'character', standing: 10 },
        { contact_id: 98100002, contact_type: 'corporation', standing: -10 },
        { contact_id: 99100001, contact_type: 'alliance', standing: 10 },
        { contact_id: 500001, contact_type: 'faction', standing: 5 },
        { contact_id: 3_008_416, contact_type: 'character', standing: 0 },
        { contact_id: 2120000005, contact_type: 'character', standing: -5 },
      ])
    ).toEqual([2120000001, 2120000005]);
  });
});
