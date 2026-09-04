import { describe, it, expect } from 'vitest';
import i18n from './index';
import {
  projectSkillQueue,
  projectIndustryJobs,
  projectColonies,
  projectCalendar,
} from '@/engine/projection';

const T0 = 1_700_000_000_000;
const HOUR_MS = 3_600_000;

/**
 * Matches `foregroundPoller.ts`'s own local Romanization of a skill level —
 * duplicated here deliberately: this test's whole point is to drive the
 * live i18next path with the same *raw* business values `projection.ts`'s
 * Scheduled Push path receives, so it must format them the way the live
 * path actually does rather than importing that logic (which would make
 * the test assert the code agrees with itself).
 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

describe('notifications.fired.* — live i18next path agrees with projection.ts', () => {
  it('skillLevelComplete: same character/skill/level produce the same string on both paths', () => {
    const entries = [
      { skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: T0 + 5 * HOUR_MS },
      { skillId: 2, finishedLevel: 1, queuePosition: 1, finishMs: T0 + 10 * HOUR_MS },
    ];
    const [row] = projectSkillQueue(1, 'Kestrel', entries, new Map([[1, 'Gunnery']]), T0);
    const live = i18n.t('notifications.fired.skillLevelComplete.body', {
      character: 'Kestrel',
      skill: 'Gunnery',
      level: ROMAN[3 - 1],
    });
    expect(live).toEqual(row.body);
    expect(i18n.t('notifications.fired.skillLevelComplete.title')).toEqual(row.title);
  });

  it('characterNotTraining: same character produces the same string on both paths', () => {
    const entries = [
      { skillId: 1, finishedLevel: 5, queuePosition: 0, finishMs: T0 + 5 * HOUR_MS },
    ];
    const rows = projectSkillQueue(1, 'Kestrel', entries, new Map([[1, 'Gunnery']]), T0);
    const row = rows[rows.length - 1];
    const live = i18n.t('notifications.fired.characterNotTraining.body', { character: 'Kestrel' });
    expect(live).toEqual(row.body);
    expect(i18n.t('notifications.fired.characterNotTraining.title')).toEqual(row.title);
  });

  it('industryJobComplete: same character/item produce the same string on both paths', () => {
    const entries = [
      {
        jobId: 1,
        blueprintTypeId: 100,
        productTypeId: 200,
        activityId: 1,
        endMs: T0 + 5 * HOUR_MS,
      },
    ];
    const [row] = projectIndustryJobs(1, 'Kestrel', entries, new Map([[200, 'Rifter']]), T0);
    const live = i18n.t('notifications.fired.industryJobComplete.body', {
      character: 'Kestrel',
      item: 'Rifter',
    });
    expect(live).toEqual(row.body);
    expect(i18n.t('notifications.fired.industryJobComplete.title')).toEqual(row.title);
  });

  it('planetaryExtractionDone and planetaryExtractorExpiring produce the same strings on both paths', () => {
    const expiryTimeMs = T0 + 30 * HOUR_MS;
    const colonies = [
      {
        planetId: 1,
        extractors: [{ pinId: 1, expiryTimeMs }],
      },
    ];
    const rows = projectColonies(1, 'Kestrel', colonies, new Map([[1, 'Amarr Prime III']]), T0);
    const doneRow = rows.find((r) => r.eventId === 'planetaryExtractionDone');
    const expiringRow = rows.find((r) => r.eventId === 'planetaryExtractorExpiring');
    expect(doneRow).toBeDefined();
    expect(expiringRow).toBeDefined();

    const liveDone = i18n.t('notifications.fired.planetaryExtractionDone.body', {
      character: 'Kestrel',
      planet: 'Amarr Prime III',
    });
    expect(liveDone).toEqual(doneRow?.body);

    const hours = Math.round((expiryTimeMs - (expiringRow?.fireAt ?? 0)) / HOUR_MS);
    const liveExpiring = i18n.t('notifications.fired.planetaryExtractorExpiring.body', {
      character: 'Kestrel',
      planet: 'Amarr Prime III',
      hours,
    });
    expect(liveExpiring).toEqual(expiringRow?.body);
  });

  it('calendarEventStarting: same character produces the same string on both paths', () => {
    const entries = [{ calendarEventId: 1, startMs: T0 + 5 * HOUR_MS }];
    const [row] = projectCalendar(1, 'Kestrel', entries, T0);
    const live = i18n.t('notifications.fired.calendarEventStarting.body', { character: 'Kestrel' });
    expect(live).toEqual(row.body);
    expect(i18n.t('notifications.fired.calendarEventStarting.title')).toEqual(row.title);
  });
});
