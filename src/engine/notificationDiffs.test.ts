import { describe, it, expect } from 'vitest';
import {
  diffSkillLevelComplete,
  diffCharacterNotTraining,
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  diffContractAccepted,
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  diffEveNotification,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobSnapshot,
  type ColonySnapshotEntry,
  type PlanetarySnapshot,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
  type ContractEntrySnapshot,
  type ContractSnapshot,
  type WalletJournalEntrySnapshot,
  type WalletSnapshot,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type EveNotificationEntrySnapshot,
  type EveNotificationSnapshot,
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

function walletEntry(id: number, amount: number | null = 100): WalletJournalEntrySnapshot {
  return { id, amount };
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
    expect(diffWalletBalanceChanged(7, prev, next)).toEqual([
      { eventId: 'walletBalanceChanged', characterId: 7, amount: 250 },
    ]);
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
      { eventId: 'walletBalanceChanged', characterId: 7, amount: 100 },
      { eventId: 'walletBalanceChanged', characterId: 7, amount: 100 },
    ]);
  });
});

function orderEntry(orderId: number, filled: boolean): MarketOrderEntrySnapshot {
  return { orderId, filled };
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

  it('fires when a sell order newly transitions to filled', () => {
    const prev = orderSnapshot([orderEntry(1, false)], T0);
    const next = orderSnapshot([orderEntry(1, true)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      { eventId: 'marketOrderFilled', characterId: 7, orderId: 1 },
    ]);
  });

  it('fires the same event type when a buy order newly transitions to filled', () => {
    const prev = orderSnapshot([orderEntry(2, false)], T0);
    const next = orderSnapshot([orderEntry(2, true)], T0 + 2000);
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      { eventId: 'marketOrderFilled', characterId: 7, orderId: 2 },
    ]);
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
    expect(diffMarketOrderFilled(7, prev, next)).toEqual([
      { eventId: 'marketOrderFilled', characterId: 7, orderId: 1 },
    ]);
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
