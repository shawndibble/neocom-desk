import { describe, it, expect } from 'vitest';
import {
  diffSkillLevelComplete,
  diffCharacterNotTraining,
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  diffPlanetaryExtractorExpiring,
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  diffContractAccepted,
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  diffEveNotification,
  diffStructureFuelLow,
  diffCorpIndustryJobReady,
  diffCorpMemberJoined,
  diffCorpMemberLeft,
  diffCorpWalletThreshold,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobSnapshot,
  type ColonySnapshotEntry,
  type ExtractorExpiringFire,
  type PlanetarySnapshot,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
  type ContractEntrySnapshot,
  type ContractSnapshot,
  type WalletJournalEntrySnapshot,
  type WalletNotificationFire,
  type WalletSnapshot,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type EveNotificationEntrySnapshot,
  type EveNotificationSnapshot,
  type StructureFuelEntrySnapshot,
  type StructureFuelSnapshot,
  type CorpIndustryJobEntrySnapshot,
  type CorpIndustryJobSnapshot,
  type CorpRosterSnapshot,
  type CorpWalletDivisionSnapshot,
  type CorpWalletSnapshot,
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
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 3, finishMs: T0 + 1000 },
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
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 1, finishMs: T0 + 100 },
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 2, level: 2, finishMs: T0 + 200 },
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
      {
        eventId: 'characterNotTraining',
        characterId: 7,
        skillId: null,
        level: null,
        finishMs: null,
      },
    ]);
  });

  it('fires when the head entry stalls (loses its finish date) after having one', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
    const next = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: null })], T0 + 2000);
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([
      {
        eventId: 'characterNotTraining',
        characterId: 7,
        skillId: null,
        level: null,
        finishMs: null,
      },
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

  it('does not fire when a just-finished entry is still the queue-position-0 row but the queue has more, active entries behind it', () => {
    // A completed-but-still-present row at the front is the normal shape on
    // a completion poll (diffSkillLevelComplete detects completion the same
    // way) — this must read "training" off the next real entry, not
    // "not training" off the completed one.
    const prev = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 10_000 }),
      ],
      T0
    );
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishMs: T0 + 10_000 }),
      ],
      T0 + 2000
    );
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([]);
  });

  it('still fires when the entry that just finished was the last one in the queue', () => {
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })], T0);
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1000 })],
      T0 + 2000
    );
    expect(diffCharacterNotTraining(7, prev, next)).toEqual([
      {
        eventId: 'characterNotTraining',
        characterId: 7,
        skillId: null,
        level: null,
        finishMs: null,
      },
    ]);
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
      {
        eventId: 'characterNotTraining',
        characterId: 7,
        skillId: null,
        level: null,
        finishMs: null,
      },
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
    ).toEqual([
      {
        eventId: 'characterNotTraining',
        characterId: 7,
        skillId: null,
        level: null,
        finishMs: null,
      },
    ]);
  });

  it('fires only skillLevelComplete, not characterNotTraining, when a skill finishes with more behind it', () => {
    const completionPrev = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishedLevel: 1, finishMs: T0 + 10_000 }),
      ],
      T0
    );
    const completionNext = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs: T0 + 1000 }),
        entry({ skillId: 2, queuePosition: 1, finishedLevel: 1, finishMs: T0 + 10_000 }),
      ],
      T0 + 2000
    );
    expect(
      runSkillQueueNotificationDiffs(
        7,
        completionPrev,
        completionNext,
        new Set(['skillLevelComplete', 'characterNotTraining'])
      )
    ).toEqual([
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 3, finishMs: T0 + 1000 },
    ]);
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
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 + 1000 },
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
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 - 1000 },
    ]);
  });

  it('fires once per colony when multiple colonies go idle in the same poll', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])],
      T0 + 300
    );
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 + 100 },
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 2, expiryTimeMs: T0 + 200 },
    ]);
  });
});

const HOUR = 3_600_000;

/** A colony whose extractor pin ids are given explicitly, so a restart on the same pin is expressible. */
function colonyWithPins(
  planetId: number,
  extractors: readonly { pinId: number; expiryTimeMs: number }[]
): ColonySnapshotEntry {
  return { planetId, extractors };
}

function expiringFire(
  characterId: number,
  planetId: number,
  pinId: number,
  thresholdMs: number,
  expiryTimeMs: number
): ExtractorExpiringFire {
  return {
    eventId: 'planetaryExtractorExpiring',
    characterId,
    planetId,
    pinId,
    thresholdMs,
    expiryTimeMs,
  };
}

describe('diffPlanetaryExtractorExpiring', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = planetarySnapshot([colonyEntry(1, [T0 + 10 * HOUR])], T0);
    expect(diffPlanetaryExtractorExpiring(7, undefined, next)).toEqual([]);
  });

  it('never fires for a program that has already expired, even across a closed-app gap', () => {
    // The regression this event exists to avoid (issue #310, AC2): the naive
    // `expiry - now <= 24h` predicate stays true forever after expiry, so a
    // user who closed the app at T-30h and reopened at T+5h would be told a
    // program that died five hours ago is "expiring soon". Expired is
    // `planetaryExtractionDone`'s to report, never this event's.
    const expiryMs = T0 + 30 * HOUR;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs + 5 * HOUR);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires nothing at the instant of expiry, handing the colony to planetaryExtractionDone', () => {
    const expiryMs = T0 + 30 * HOUR;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('does not fire while the program is outside both windows', () => {
    const expiryMs = T0 + 40 * HOUR;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires once as the program crosses into the 24-hour window', () => {
    const expiryMs = T0 + 24 * HOUR + FIVE_MIN;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR, expiryMs),
    ]);
  });

  it('fires when the remaining time lands exactly on a threshold', () => {
    const expiryMs = T0 + 24 * HOUR + 1;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + 1);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR, expiryMs),
    ]);
  });

  it('does not re-fire on later polls still inside the 24-hour window', () => {
    const expiryMs = T0 + 24 * HOUR;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + 2 * FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires once as the program crosses into the 12-hour window, and not again after', () => {
    const expiryMs = T0 + 24 * HOUR;
    const crossing = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs - 12 * HOUR);
    const beforeCrossing = planetarySnapshot(
      [colonyEntry(1, [expiryMs])],
      expiryMs - 12 * HOUR - FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, beforeCrossing, crossing)).toEqual([
      expiringFire(7, 1, 1, 12 * HOUR, expiryMs),
    ]);

    const after = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs - 12 * HOUR + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, crossing, after)).toEqual([]);
  });

  it('fires both edges in one poll when a gap crosses both while the program is still alive', () => {
    // Two independent edges per program: a poll that skips over both reports
    // both, most-distant threshold first so the 12-hour copy is the one that
    // wins the shared browser notification tag.
    const expiryMs = T0 + 30 * HOUR;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs - HOUR);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR, expiryMs),
      expiringFire(7, 1, 1, 12 * HOUR, expiryMs),
    ]);
  });

  it('fires once for a program first observed already inside a window', () => {
    const expiryMs = T0 + 20 * HOUR;
    const prev = planetarySnapshot([colonyWithPins(1, [])], T0);
    const next = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 42, expiryTimeMs: expiryMs }])],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 42, 24 * HOUR, expiryMs),
    ]);
  });

  it('fires for a colony absent from a defined prev', () => {
    const expiryMs = T0 + 20 * HOUR;
    const prev = planetarySnapshot([colonyEntry(2, [T0 + 40 * HOUR])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [expiryMs]), colonyEntry(2, [T0 + 40 * HOUR])],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR, expiryMs),
    ]);
  });

  it('fires for a program restarted on a pin whose previous program was already inside the window', () => {
    // Identity is (pinId, expiryTimeMs): `expiry_time` is fixed for a
    // program's life, so a changed expiry on the same pin is a new program,
    // and the dead one's position inside the window must not swallow the new
    // one's first crossing.
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 5, expiryTimeMs: T0 - 2 * HOUR }])],
      T0
    );
    const next = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 5, expiryTimeMs: T0 + 20 * HOUR }])],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 5, 24 * HOUR, T0 + 20 * HOUR),
    ]);
  });

  it('fires per extractor program across colonies', () => {
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: T0 + 24 * HOUR + FIVE_MIN },
          { pinId: 2, expiryTimeMs: T0 + 24 * HOUR + FIVE_MIN },
        ]),
        colonyWithPins(2, [{ pinId: 3, expiryTimeMs: T0 + 40 * HOUR }]),
      ],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: T0 + 24 * HOUR + FIVE_MIN },
          { pinId: 2, expiryTimeMs: T0 + 24 * HOUR + FIVE_MIN },
        ]),
        colonyWithPins(2, [{ pinId: 3, expiryTimeMs: T0 + 40 * HOUR }]),
      ],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR, T0 + 24 * HOUR + FIVE_MIN),
      expiringFire(7, 1, 2, 24 * HOUR, T0 + 24 * HOUR + FIVE_MIN),
    ]);
  });
});

function mailEntry(mailId: number): MailHeaderSnapshot {
  return { mailId };
}

function mailSnapshot(entries: readonly MailHeaderSnapshot[], nowMs: number): MailSnapshot {
  return { entries, nowMs };
}

describe('diffNewMail', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = mailSnapshot([mailEntry(5)], T0);
    expect(diffNewMail(1, undefined, next)).toEqual([]);
  });

  it('fires when a mail id above the previous high-water mark appears', () => {
    const prev = mailSnapshot([mailEntry(5), mailEntry(3)], T0);
    const next = mailSnapshot([mailEntry(6), mailEntry(5), mailEntry(3)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([{ eventId: 'newMail', characterId: 7, mailId: 6 }]);
  });

  it('does not fire for an id already seen', () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot([mailEntry(5)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([]);
  });

  it('does not fire for an older id newly paged in below the high-water mark ("load more")', () => {
    const prev = mailSnapshot([mailEntry(10)], T0);
    const next = mailSnapshot([mailEntry(10), mailEntry(9), mailEntry(1)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([]);
  });

  it('fires once per new mail id when multiple arrive in the same poll', () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot([mailEntry(7), mailEntry(6), mailEntry(5)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([
      { eventId: 'newMail', characterId: 7, mailId: 7 },
      { eventId: 'newMail', characterId: 7, mailId: 6 },
    ]);
  });
});

function calendarEntry(calendarEventId: number, startMs: number): CalendarEventEntrySnapshot {
  return { calendarEventId, startMs };
}

function calendarSnapshot(
  entries: readonly CalendarEventEntrySnapshot[],
  nowMs: number
): CalendarSnapshot {
  return { entries, nowMs };
}

describe('diffNewCalendarEvent', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = calendarSnapshot([calendarEntry(5, T0 + 1000)], T0);
    expect(diffNewCalendarEvent(1, undefined, next)).toEqual([]);
  });

  it('fires when an event id above the previous high-water mark appears', () => {
    const prev = calendarSnapshot([calendarEntry(5, T0 + 1000)], T0);
    const next = calendarSnapshot(
      [calendarEntry(6, T0 + 5000), calendarEntry(5, T0 + 1000)],
      T0 + 2000
    );
    expect(diffNewCalendarEvent(7, prev, next)).toEqual([
      { eventId: 'newCalendarEvent', characterId: 7, calendarEventId: 6 },
    ]);
  });

  it('does not fire for an older event newly entering the 50-event window', () => {
    const prev = calendarSnapshot([calendarEntry(10, T0 + 1000)], T0);
    const next = calendarSnapshot(
      [calendarEntry(10, T0 + 1000), calendarEntry(2, T0 + 500)],
      T0 + 2000
    );
    expect(diffNewCalendarEvent(7, prev, next)).toEqual([]);
  });
});

describe('diffCalendarEventStarting', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = calendarSnapshot([calendarEntry(1, T0 - 1000)], T0);
    expect(diffCalendarEventStarting(1, undefined, next)).toEqual([]);
  });

  it('fires when an event newly starts', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1 },
    ]);
  });

  it('does not fire before the event starts', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 5000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 5000)], T0 + 1000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for an event that already started as of the previous poll', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 - 5000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 - 5000)], T0 + FIVE_MIN);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([]);
  });

  it('fires for an event that only appears once already started (never seen upcoming before)', () => {
    const prev = calendarSnapshot([], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1 },
    ]);
  });
});

function contractEntry(
  contractId: number,
  status: ContractEntrySnapshot['status']
): ContractEntrySnapshot {
  return { contractId, status };
}

function contractSnapshot(
  entries: readonly ContractEntrySnapshot[],
  nowMs: number
): ContractSnapshot {
  return { entries, nowMs };
}

describe('diffContractAccepted', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    expect(diffContractAccepted(1, undefined, next)).toEqual([]);
  });

  it('fires when a contract newly transitions to in_progress', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([
      { eventId: 'contractAccepted', characterId: 7, contractId: 1 },
    ]);
  });

  it('does not fire while the contract stays outstanding', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'outstanding')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a contract already in_progress as of the previous poll', () => {
    const prev = contractSnapshot([contractEntry(1, 'in_progress')], T0);
    const next = contractSnapshot([contractEntry(1, 'in_progress')], T0 + FIVE_MIN);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });

  it('fires for a contract that only appears once already in_progress (never seen outstanding before)', () => {
    const prev = contractSnapshot([contractEntry(2, 'outstanding')], T0);
    const next = contractSnapshot(
      [contractEntry(1, 'in_progress'), contractEntry(2, 'outstanding')],
      T0 + 2000
    );
    expect(diffContractAccepted(7, prev, next)).toEqual([
      { eventId: 'contractAccepted', characterId: 7, contractId: 1 },
    ]);
  });

  it('does not fire when a contract finishes without ever being in_progress', () => {
    const prev = contractSnapshot([contractEntry(1, 'outstanding')], T0);
    const next = contractSnapshot([contractEntry(1, 'finished')], T0 + 2000);
    expect(diffContractAccepted(7, prev, next)).toEqual([]);
  });
});

function walletEntry(
  id: number,
  amount: number | null = 100,
  thresholdIsk = 0,
  dateMs = T0 + id
): WalletJournalEntrySnapshot {
  return { id, amount, thresholdIsk, dateMs };
}

/** The fire `walletEntry(id, amount)` produces, so the two stay in step. */
function walletFire(id: number, amount: number, dateMs = T0 + id): WalletNotificationFire {
  return { eventId: 'walletBalanceChanged', characterId: 7, amount, journalEntryId: id, dateMs };
}

function walletSnapshot(
  entries: readonly WalletJournalEntrySnapshot[],
  nowMs: number
): WalletSnapshot {
  return { entries, nowMs };
}

describe('diffWalletBalanceChanged', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = walletSnapshot([walletEntry(5)], T0);
    expect(diffWalletBalanceChanged(1, undefined, next)).toEqual([]);
  });

  it('fires when a journal entry id above the previous high-water mark appears', () => {
    const prev = walletSnapshot([walletEntry(5), walletEntry(3)], T0);
    const next = walletSnapshot([walletEntry(6, 250), walletEntry(5), walletEntry(3)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 250)]);
  });

  it('does not fire for an id already seen', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('does not fire while the balance merely differs from a baseline across many polls with no new entry', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(5)], T0 + FIVE_MIN * 10);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('fires once per new journal entry when multiple arrive in the same poll', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(7), walletEntry(6), walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      walletFire(6, 100),
      walletFire(7, 100),
    ]);
  });

  it('orders fires oldest-entry-first even though ESI returns the journal newest-first, so the delivery loop records (and the feed shows) the newest one last', () => {
    const prev = walletSnapshot([walletEntry(5)], T0);
    // ESI's own order: id 7 (newest) before id 6 (older) before the
    // already-seen id 5.
    const next = walletSnapshot(
      [walletEntry(7, 700), walletEntry(6, 600), walletEntry(5, 500)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      walletFire(6, 600),
      walletFire(7, 700),
    ]);
  });

  it('does not fire for a new entry whose absolute amount is under the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, 999_999, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });

  it('fires for a new entry whose absolute amount is at or above the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, 1_000_000, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 1_000_000)]);
  });

  it('fires for a large negative (ISK spent) entry once its magnitude crosses the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, -2_000_000, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, -2_000_000)]);
  });

  it('does not fire for a new entry with a null amount, since it cannot be compared to the threshold', () => {
    const prev = walletSnapshot([walletEntry(5, 100, 1_000_000)], T0);
    const next = walletSnapshot(
      [walletEntry(6, null, 1_000_000), walletEntry(5, 100, 1_000_000)],
      T0 + 2000
    );
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([]);
  });
  it("carries the journal entry's own id and date, so the Occurrence Key and the feed row's time come from the payment rather than the poll", () => {
    const paidAt = T0 - 3 * 86_400_000;
    const prev = walletSnapshot([walletEntry(5)], T0);
    const next = walletSnapshot([walletEntry(6, 250, 0, paidAt), walletEntry(5)], T0 + 2000);
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([walletFire(6, 250, paidAt)]);
  });
});
function orderEntry(
  orderId: number,
  filled: boolean,
  overrides: Partial<MarketOrderEntrySnapshot> = {}
): MarketOrderEntrySnapshot {
  return { orderId, filled, isBuyOrder: false, typeId: 34, quantity: 100, ...overrides };
}

function orderSnapshot(
  entries: readonly MarketOrderEntrySnapshot[],
  nowMs: number
): MarketOrderSnapshot {
  return { entries, nowMs };
}

describe('diffMarketOrderFilled', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = orderSnapshot([orderEntry(1, true)], T0);
    expect(diffMarketOrderFilled(1, undefined, next)).toEqual([]);
  });

  it('fires when a sell order newly transitions to filled, naming the item and how many', () => {
    const prev = orderSnapshot([orderEntry(1, false, { typeId: 34, quantity: 250 })], T0);
    const next = orderSnapshot([orderEntry(1, true, { typeId: 34, quantity: 250 })], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      { eventId: 'marketOrderFilled', characterId: 7, orderId: 1, typeId: 34, quantity: 250 },
    ]);
  });

  it('stays silent for a filled buy order — nobody bought anything from you', () => {
    const prev = orderSnapshot([orderEntry(2, false, { isBuyOrder: true })], T0);
    const next = orderSnapshot([orderEntry(2, true, { isBuyOrder: true })], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('still fires the sell orders in a batch that also holds a filled buy order', () => {
    const prev = orderSnapshot(
      [orderEntry(1, false), orderEntry(2, false, { isBuyOrder: true })],
      T0
    );
    const next = orderSnapshot(
      [orderEntry(1, true), orderEntry(2, true, { isBuyOrder: true })],
      T0 + 2000
    );
    expect(diffMarketOrderFilled(7, prev, next).map((f) => f.orderId)).toEqual([1]);
  });

  it('does not fire while an order stays unfilled', () => {
    const prev = orderSnapshot([orderEntry(1, false)], T0);
    const next = orderSnapshot([orderEntry(1, false)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for an order already filled as of the previous poll', () => {
    const prev = orderSnapshot([orderEntry(1, true)], T0);
    const next = orderSnapshot([orderEntry(1, true)], T0 + FIVE_MIN);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([]);
  });

  it('fires for an order that only appears once already filled (never seen open before)', () => {
    const prev = orderSnapshot([orderEntry(2, false)], T0);
    const next = orderSnapshot([orderEntry(1, true), orderEntry(2, false)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next).map((f) => f.orderId)).toEqual([1]);
  });
});

function eveNotificationEntry(
  notificationId: number,
  overrides: Partial<EveNotificationEntrySnapshot> = {}
): EveNotificationEntrySnapshot {
  return {
    notificationId,
    type: 'BillOutOfMoneyMsg',
    senderId: 1000132,
    senderType: 'corporation',
    text: 'amount: 12345\n',
    timestamp: '2026-09-03T00:00:00Z',
    ...overrides,
  };
}

function eveNotificationSnapshot(
  entries: readonly EveNotificationEntrySnapshot[],
  nowMs: number
): EveNotificationSnapshot {
  return { entries, nowMs };
}

describe('diffEveNotification', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    expect(diffEveNotification(1, undefined, next)).toEqual([]);
  });

  it('fires when a notification id above the previous high-water mark appears', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5), eveNotificationEntry(3)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(6), eveNotificationEntry(5), eveNotificationEntry(3)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([
      {
        eventId: 'eveNotification',
        characterId: 7,
        notificationId: 6,
        type: 'BillOutOfMoneyMsg',
        senderId: 1000132,
        senderType: 'corporation',
        text: 'amount: 12345\n',
        timestamp: '2026-09-03T00:00:00Z',
      },
    ]);
  });

  it('does not fire for an id already seen', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    const next = eveNotificationSnapshot([eveNotificationEntry(5)], T0 + 2000);
    expect(diffEveNotification(7, prev, next)).toEqual([]);
  });

  it('does not fire for an older id newly paged into the window', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(10)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(10), eveNotificationEntry(9), eveNotificationEntry(1)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([]);
  });

  it('carries an unrecognised type through untouched rather than dropping or throwing (AC2)', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(6, { type: 'SomeBrandNewMsgType6041' }), eveNotificationEntry(5)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([
      expect.objectContaining({ notificationId: 6, type: 'SomeBrandNewMsgType6041' }),
    ]);
  });
});

const DAY = 86_400_000;

function fuelEntry(
  overrides: Partial<StructureFuelEntrySnapshot> & Pick<StructureFuelEntrySnapshot, 'structureId'>
): StructureFuelEntrySnapshot {
  return { name: 'Fortizar', fuelExpiresMs: null, thresholdMs: 7 * DAY, ...overrides };
}

function fuelSnapshot(
  entries: readonly StructureFuelEntrySnapshot[],
  nowMs: number
): StructureFuelSnapshot {
  return { entries, nowMs };
}

describe('diffStructureFuelLow', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + DAY })], T0);
    expect(diffStructureFuelLow(1, undefined, next)).toEqual([]);
  });

  it('fires when remaining fuel newly crosses the threshold', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 8 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 8 * DAY })],
      T0 + 2 * DAY
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 8 * DAY,
      },
    ]);
  });

  it('does not fire while remaining fuel is still above the threshold', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 20 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 20 * DAY })],
      T0 + DAY
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a structure already under threshold as of the previous poll', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('fires for a structure discovered already under threshold (never seen active before)', () => {
    const prev = fuelSnapshot([], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })],
      T0 + 2000
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 2 * DAY,
      },
    ]);
  });

  it('does not fire once a structure has already run fully dry (null fuelExpiresMs)', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })], T0);
    const next = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: null })], T0 + 3 * DAY);
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('re-fires on a fresh refuel cycle that is itself already inside the window', () => {
    // A refuel moves fuel_expires to a new, later instant — a different
    // countdown from the one `prev` observed, so it is judged fresh rather
    // than matched against the old identity and skipped as already seen.
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 3 * DAY })],
      T0 + 10_000
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 3 * DAY,
      },
    ]);
  });

  it('lowering the threshold does not re-fire for a structure already inside the wider, previous window', () => {
    // Was inside the 7-day window (and so already reported) before the
    // Character narrowed it to 1 day — narrowing must not manufacture a
    // second fire for a crossing already reported under the wider setting.
    const prev = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 12 * 3_600_000, thresholdMs: 7 * DAY })],
      T0
    );
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 12 * 3_600_000, thresholdMs: DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('raising the threshold fires on the very next poll, without a reload (AC4)', () => {
    // 5 days remaining was outside the old 1-day window (never reported);
    // once the Character widens it to 7 days, that same 5 days is newly
    // inside — must fire on this poll, not wait for a fresh baseline.
    const prev = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 5 * DAY, thresholdMs: DAY })],
      T0
    );
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 5 * DAY, thresholdMs: 7 * DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 5 * DAY,
      },
    ]);
  });
});

function corpJobEntry(
  overrides: Partial<CorpIndustryJobEntrySnapshot> &
    Pick<CorpIndustryJobEntrySnapshot, 'jobId' | 'endMs'>
): CorpIndustryJobEntrySnapshot {
  return { blueprintTypeId: 1000, productTypeId: 2000, activityId: 1, ...overrides };
}

function corpJobSnapshot(
  entries: readonly CorpIndustryJobEntrySnapshot[],
  nowMs: number
): CorpIndustryJobSnapshot {
  return { entries, nowMs };
}

describe('diffCorpIndustryJobReady', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 1000 })], T0);
    expect(diffCorpIndustryJobReady(1, undefined, next)).toEqual([]);
  });

  it('fires when a corp job newly completes', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 1000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([
      {
        eventId: 'corpIndustryJobReady',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
      },
    ]);
  });

  it('does not fire for a job not yet finished', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 5000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 5000 })], T0 + 1000);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a job already finished as of the previous poll', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 5000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 5000 })], T0 + FIVE_MIN);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([]);
  });
});

function rosterSnapshot(characterIds: readonly number[], nowMs: number): CorpRosterSnapshot {
  return { entries: characterIds.map((characterId) => ({ characterId })), nowMs };
}

describe('diffCorpMemberJoined / diffCorpMemberLeft', () => {
  it('fire nothing on the first-ever poll (no baseline to diff against)', () => {
    const next = rosterSnapshot([1, 2, 3], T0);
    expect(diffCorpMemberJoined(7, undefined, next)).toEqual([]);
    expect(diffCorpMemberLeft(7, undefined, next)).toEqual([]);
  });

  it('fires corpMemberJoined for an id newly in the roster', () => {
    const prev = rosterSnapshot([1, 2], T0);
    const next = rosterSnapshot([1, 2, 3], T0 + FIVE_MIN);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([
      { eventId: 'corpMemberJoined', characterId: 7, memberCharacterId: 3 },
    ]);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([]);
  });

  it('fires corpMemberLeft for an id newly gone from the roster', () => {
    const prev = rosterSnapshot([1, 2, 3], T0);
    const next = rosterSnapshot([1, 2], T0 + FIVE_MIN);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([
      { eventId: 'corpMemberLeft', characterId: 7, memberCharacterId: 3 },
    ]);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([]);
  });

  it('fires nothing when the roster is unchanged', () => {
    const prev = rosterSnapshot([1, 2], T0);
    const next = rosterSnapshot([1, 2], T0 + FIVE_MIN);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([]);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([]);
  });
});

function walletDivision(
  overrides: Partial<CorpWalletDivisionSnapshot> & Pick<CorpWalletDivisionSnapshot, 'division'>
): CorpWalletDivisionSnapshot {
  return {
    balance: 1_000_000_000,
    journal: [],
    balanceFloorIsk: 50_000_000,
    transactionCeilingIsk: 100_000_000,
    ...overrides,
  };
}

function corpWalletSnapshot(
  divisions: readonly CorpWalletDivisionSnapshot[],
  nowMs: number
): CorpWalletSnapshot {
  return { divisions, nowMs };
}

describe('diffCorpWalletThreshold', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = corpWalletSnapshot([walletDivision({ division: 1, balance: 1_000 })], T0);
    expect(diffCorpWalletThreshold(1, undefined, next)).toEqual([]);
  });

  it('fires balanceBelow when a division balance newly drops to or under the floor', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, balance: 60_000_000 })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 1,
        balance: 40_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('does not re-fire balanceBelow for a division already under floor as of the previous poll', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, balance: 40_000_000 })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 30_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('lowering the floor does not re-fire for a division already under the wider, previous floor', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 50_000_000 })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 20_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('raising the floor fires on the very next poll, without a reload (AC4)', () => {
    // 40M was above the old 20M floor (never reported); once the Character
    // raises the floor to 50M, that same 40M is newly under it.
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 20_000_000 })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 50_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 1,
        balance: 40_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('checks balanceBelow across every division, not just the master', () => {
    const prev = corpWalletSnapshot(
      [
        walletDivision({ division: 1, balance: 60_000_000 }),
        walletDivision({ division: 2, balance: 60_000_000 }),
      ],
      T0
    );
    const next = corpWalletSnapshot(
      [
        walletDivision({ division: 1, balance: 60_000_000 }),
        walletDivision({ division: 2, balance: 10_000_000 }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 2,
        balance: 10_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('fires transactionAbove for a new master-division journal entry over the ceiling', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 1, amount: -1_000 }] })],
      T0
    );
    const next = corpWalletSnapshot(
      [
        walletDivision({
          division: 1,
          journal: [
            { id: 2, amount: 250_000_000 },
            { id: 1, amount: -1_000 },
          ],
        }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'transactionAbove',
        division: 1,
        amount: 250_000_000,
        thresholdIsk: 100_000_000,
        journalEntryId: 2,
      },
    ]);
  });

  it('does not fire transactionAbove for a new entry under the ceiling', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, journal: [] })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 1_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('does not re-fire transactionAbove for a journal entry id already seen', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 250_000_000 }] })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 250_000_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('fires transactionAbove for a large negative (outbound) transaction using its absolute value', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, journal: [] })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: -250_000_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'transactionAbove',
        division: 1,
        amount: -250_000_000,
        thresholdIsk: 100_000_000,
        journalEntryId: 2,
      },
    ]);
  });

  it('does not check transactionAbove on a division with no journal (non-master)', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 2, journal: [] })], T0);
    const next = corpWalletSnapshot([walletDivision({ division: 2, journal: [] })], T0 + FIVE_MIN);
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });
});
