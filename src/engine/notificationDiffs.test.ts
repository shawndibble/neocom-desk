import { describe, it, expect } from 'vitest';
import {
  diffSkillLevelComplete,
  diffCharacterNotTraining,
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobSnapshot,
  type ColonySnapshotEntry,
  type PlanetarySnapshot,
} from './notificationDiffs';

function entry(
  overrides: Partial<SkillQueueEntrySnapshot> &
    Pick<SkillQueueEntrySnapshot, 'skillId' | 'queuePosition'>
): SkillQueueEntrySnapshot {
  return { finishedLevel: 1, finishMs: null, ...overrides };
}

function snapshot(entries: readonly SkillQueueEntrySnapshot[], nowMs: number): SkillQueueSnapshot {
  return { entries, nowMs };
}

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

describe('diffSkillLevelComplete', () => {
  it('fires nothing on the first-ever poll (no baseline to compare against)', () => {
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs: T0 - 1000 })],
      T0
    );
    expect(diffSkillLevelComplete(1, undefined, next)).toEqual([]);
  });

  it('fires when a queued entry newly finishes and the queue still has more behind it', () => {
    const prev = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishedLevel: 4, finishMs: T0 + 10_000 }),
      ],
      T0
    );
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishedLevel: 4, finishMs: T0 + 10_000 }),
      ],
      T0 + 2000
    );
    expect(diffSkillLevelComplete(7, prev, next)).toEqual([
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 3 },
    ]);
  });

  it('does not fire when the newly-finished entry is the last one in the queue', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })],
      T0 + 2000
    );
    expect(diffSkillLevelComplete(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for an entry that was already finished as of the previous poll', () => {
    const prev = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 - 5000 }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 5000 }),
      ],
      T0
    );
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 - 5000 }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 5000 }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffSkillLevelComplete(7, prev, next)).toEqual([]);
  });

  it('ignores paused entries (no finish date at all)', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: null })], T0);
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: null }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 1000 }),
      ],
      T0 + 2000
    );
    expect(diffSkillLevelComplete(7, prev, next)).toEqual([]);
  });

  it('fires once per entry when multiple entries complete in the same poll', () => {
    const prev = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 100 }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 200 }),
        entry({ skillId: 3, queuePosition: 2, finishMs: T0 + 10_000 }),
      ],
      T0
    );
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishedLevel: 1, finishMs: T0 + 100 }),
        entry({ skillId: 2, queuePosition: 1, finishedLevel: 2, finishMs: T0 + 200 }),
        entry({ skillId: 3, queuePosition: 2, finishedLevel: 5, finishMs: T0 + 10_000 }),
      ],
      T0 + 300
    );
    expect(diffSkillLevelComplete(7, prev, next)).toEqual([
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 1 },
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 2, level: 2 },
    ]);
  });
});

describe('diffCharacterNotTraining', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = snapshot([], T0);
    expect(diffCharacterNotTraining(1, undefined, next)).toEqual([]);
  });

  it('fires when the queue empties out after having something training', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
    const next = snapshot([], T0 + 2000);
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([
      { eventId: 'characterNotTraining', characterId: 7, skillId: null, level: null },
    ]);
  });

  it('fires when the head entry stalls (loses its finish date) after having one', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
    const next = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: null })], T0 + 2000);
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([
      { eventId: 'characterNotTraining', characterId: 7, skillId: null, level: null },
    ]);
  });

  it('does not fire while the head entry is still actively training', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 5000 })], T0);
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 5000 })],
      T0 + 1000
    );
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([]);
  });

  it('does not re-fire on a later poll while still stalled', () => {
    const prev = snapshot([], T0);
    const next = snapshot([], T0 + FIVE_MIN);
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([]);
  });

  it('fires again after resuming training and then stalling a second time', () => {
    const stalledAgain = snapshot([], T0 + 2 * FIVE_MIN);
    const wasTraining = snapshot(
      [entry({ skillId: 9, queuePosition: 0, finishMs: T0 + 2 * FIVE_MIN - 1000 })],
      T0 + FIVE_MIN
    );
    expect(diffCharacterNotTraining(7, wasTraining, stalledAgain)).toEqual([
      { eventId: 'characterNotTraining', characterId: 7, skillId: null, level: null },
    ]);
  });
});

describe('SKILL_QUEUE_NOTIFICATION_DIFFS / runSkillQueueNotificationDiffs', () => {
  const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
  const next = snapshot([], T0 + 2000);

  it('registers both events by id', () => {
    expect(Object.keys(SKILL_QUEUE_NOTIFICATION_DIFFS).sort()).toEqual([
      'characterNotTraining',
      'skillLevelComplete',
    ]);
  });

  it('only runs diffs for enabled events', () => {
    expect(runSkillQueueNotificationDiffs(7, prev, next, new Set())).toEqual([]);
    expect(
      runSkillQueueNotificationDiffs(7, prev, next, new Set(['characterNotTraining']))
    ).toEqual([{ eventId: 'characterNotTraining', characterId: 7, skillId: null, level: null }]);
  });
});

function jobEntry(
  overrides: Partial<IndustryJobEntrySnapshot> & Pick<IndustryJobEntrySnapshot, 'jobId' | 'endMs'>
): IndustryJobEntrySnapshot {
  return { blueprintTypeId: 1000, productTypeId: 2000, activityId: 1, ...overrides };
}

function jobSnapshot(
  entries: readonly IndustryJobEntrySnapshot[],
  nowMs: number
): IndustryJobSnapshot {
  return { entries, nowMs };
}

describe('diffIndustryJobComplete', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 1000 })], T0);
    expect(diffIndustryJobComplete(1, undefined, next)).toEqual([]);
  });

  it('fires when a job newly completes', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
      },
    ]);
  });

  it('does not fire for a job not yet finished', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 5000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 5000 })], T0 + 1000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a job already finished as of the previous poll', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 5000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 5000 })], T0 + FIVE_MIN);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([]);
  });

  it('fires once per job when multiple jobs complete in the same poll', () => {
    const prev = jobSnapshot(
      [jobEntry({ jobId: 1, endMs: T0 + 100 }), jobEntry({ jobId: 2, endMs: T0 + 200 })],
      T0
    );
    const next = jobSnapshot(
      [jobEntry({ jobId: 1, endMs: T0 + 100 }), jobEntry({ jobId: 2, endMs: T0 + 200 })],
      T0 + 300
    );
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
      },
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 2,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
      },
    ]);
  });

  it('fires for a job that only appears once already complete (never seen active before)', () => {
    const prev = jobSnapshot([], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
      },
    ]);
  });
});

function colonyEntry(planetId: number, expiries: readonly number[]): ColonySnapshotEntry {
  return {
    planetId,
    extractors: expiries.map((expiryTimeMs, i) => ({ pinId: i + 1, expiryTimeMs })),
  };
}

function planetarySnapshot(
  colonies: readonly ColonySnapshotEntry[],
  nowMs: number
): PlanetarySnapshot {
  return { colonies, nowMs };
}

describe('diffPlanetaryExtractionDone', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = planetarySnapshot([colonyEntry(1, [T0 - 1000])], T0);
    expect(diffPlanetaryExtractionDone(1, undefined, next)).toEqual([]);
  });

  it('fires when a colony newly goes idle', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 1000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 + 1000])], T0 + 2000);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1 },
    ]);
  });

  it('does not fire while every extractor is still active', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 5000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 + 5000])], T0 + 1000);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a colony already idle as of the previous poll', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 - 5000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 - 5000])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('does not fire for a colony with no extractors', () => {
    const prev = planetarySnapshot([colonyEntry(1, [])], T0);
    const next = planetarySnapshot([colonyEntry(1, [])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('fires for a colony discovered already idle (absent from a defined prev with other colonies)', () => {
    const prev = planetarySnapshot([colonyEntry(2, [T0 + 5000])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [T0 - 1000]), colonyEntry(2, [T0 + 5000])],
      T0 + 2000
    );
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1 },
    ]);
  });

  it('fires once per colony when multiple colonies go idle in the same poll', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])],
      T0 + 300
    );
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1 },
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 2 },
    ]);
  });
});
