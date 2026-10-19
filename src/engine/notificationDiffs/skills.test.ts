import { describe, it, expect } from 'vitest';
import {
  diffSkillLevelComplete,
  diffCharacterNotTraining,
  diffSkillQueueEnding,
  diffSpExtractionReady,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  type SpExtractionSnapshot,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;
const HOUR = 3_600_000;

function entry(
  overrides: Partial<SkillQueueEntrySnapshot> &
    Pick<SkillQueueEntrySnapshot, 'skillId' | 'queuePosition'>
): SkillQueueEntrySnapshot {
  return { finishedLevel: 1, finishMs: null, ...overrides };
}

function snapshot(entries: readonly SkillQueueEntrySnapshot[], nowMs: number): SkillQueueSnapshot {
  return { entries, nowMs };
}

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

describe('diffSkillQueueEnding', () => {
  const LEAD = 6 * 60 * 60 * 1000;

  it('fires nothing when prev is undefined (no baseline to compare against)', () => {
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1 * HOUR, endingLeadMs: LEAD })],
      T0
    );
    expect(diffSkillQueueEnding(1, undefined, next)).toEqual([]);
  });

  it('fires once as the tail crosses into its configured lead time', () => {
    const finishMs = T0 + LEAD + FIVE_MIN;
    const tail = (nowMs: number) =>
      snapshot(
        [entry({ skillId: 1, queuePosition: 0, finishedLevel: 3, finishMs, endingLeadMs: LEAD })],
        nowMs
      );
    const prev = tail(T0);
    const next = tail(T0 + FIVE_MIN);
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([
      {
        eventId: 'skillQueueEnding',
        characterId: 7,
        skillId: 1,
        level: 3,
        finishMs,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('fires nothing while the tail is outside the configured lead time', () => {
    const finishMs = T0 + 40 * HOUR;
    const entries = (nowMs: number) =>
      snapshot([entry({ skillId: 1, queuePosition: 0, finishMs, endingLeadMs: LEAD })], nowMs);
    expect(diffSkillQueueEnding(7, entries(T0), entries(T0 + FIVE_MIN))).toEqual([]);
  });

  it('does not re-fire on a later poll while the same tail is still inside the window', () => {
    const finishMs = T0 + LEAD;
    const entries = (nowMs: number) =>
      snapshot([entry({ skillId: 1, queuePosition: 0, finishMs, endingLeadMs: LEAD })], nowMs);
    const prev = entries(T0 + FIVE_MIN);
    const next = entries(T0 + 2 * FIVE_MIN);
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([]);
  });

  it('fires again once a later tail (the queue grew behind it) itself crosses back into the window', () => {
    // A queue extended with a new, later-finishing entry hands the tail role
    // to that new entry — a new re-fire identity (its own `finishMs`), so it
    // is unobserved even though the earlier tail already fired.
    const finishA = T0 + 5 * HOUR;
    const finishB = T0 + 30 * HOUR;
    const entryA = entry({
      skillId: 1,
      queuePosition: 0,
      finishedLevel: 3,
      finishMs: finishA,
      endingLeadMs: LEAD,
    });
    const entryB = (overrides: Partial<SkillQueueEntrySnapshot> = {}) =>
      entry({
        skillId: 2,
        queuePosition: 1,
        finishedLevel: 1,
        finishMs: finishB,
        endingLeadMs: LEAD,
        ...overrides,
      });

    const beforeGrowth = snapshot([entryA], T0);
    // The queue grows: the new tail (entryB) sits far outside the window.
    const grown = snapshot([entryA, entryB()], T0 + FIVE_MIN);
    expect(diffSkillQueueEnding(7, beforeGrowth, grown)).toEqual([]);

    // Time passes; entryA completes and entryB's remaining time crosses back
    // into the lead window.
    const laterNowMs = finishB - LEAD + FIVE_MIN;
    const backInside = snapshot([entryA, entryB()], laterNowMs);
    expect(diffSkillQueueEnding(7, grown, backInside)).toEqual([
      {
        eventId: 'skillQueueEnding',
        characterId: 7,
        skillId: 2,
        level: 1,
        finishMs: finishB,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('fires nothing for a paused queue (head entry has no finish date)', () => {
    const prev = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1 * HOUR, endingLeadMs: LEAD })],
      T0
    );
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: null, endingLeadMs: LEAD })],
      T0 + FIVE_MIN
    );
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([]);
  });

  it('fires nothing for an empty queue', () => {
    const prev = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishMs: T0 + 1 * HOUR, endingLeadMs: LEAD })],
      T0
    );
    const next = snapshot([], T0 + FIVE_MIN);
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([]);
  });

  it('ignores a completed-but-unpruned entry at the front when finding the tail', () => {
    // Same shape `diffSkillLevelComplete`/`headStatus` already handle: a
    // just-finished row can sit at the front with its finish date in the
    // past until the character next logs in.
    const finishTail = T0 + 5 * HOUR;
    const completedHead = entry({ skillId: 1, queuePosition: 0, finishMs: T0 - 2000 });
    const prev = snapshot([completedHead], T0);
    const next = snapshot(
      [
        entry({ skillId: 1, queuePosition: 0, finishMs: T0 - 1000 }),
        entry({
          skillId: 2,
          queuePosition: 1,
          finishedLevel: 2,
          finishMs: finishTail,
          endingLeadMs: LEAD,
        }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([
      {
        eventId: 'skillQueueEnding',
        characterId: 7,
        skillId: 2,
        level: 2,
        finishMs: finishTail,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('fires once for a prev snapshot captured before endingLeadMs existed on the type', () => {
    // A baseline persisted before issue #1410 shipped has no `endingLeadMs`
    // on its entries at all — that must read as "no threshold recorded",
    // i.e. not-previously-observed, so it fires once rather than never.
    const finishMs = T0 + 5 * HOUR;
    const prev = snapshot([entry({ skillId: 1, queuePosition: 0, finishMs })], T0);
    const next = snapshot(
      [entry({ skillId: 1, queuePosition: 0, finishedLevel: 4, finishMs, endingLeadMs: LEAD })],
      T0 + FIVE_MIN
    );
    expect(diffSkillQueueEnding(7, prev, next)).toEqual([
      {
        eventId: 'skillQueueEnding',
        characterId: 7,
        skillId: 1,
        level: 4,
        finishMs,
        thresholdMs: LEAD,
      },
    ]);
  });
});

describe('diffSpExtractionReady', () => {
  const FLOOR = 5_000_000;

  function spSnapshot(entries: { totalSp: number; thresholdSp: number }[]): SpExtractionSnapshot {
    return { entries, nowMs: T0 };
  }

  it('fires on the first-ever poll if already ready (unlike characterNotTraining: this state takes months to flip, so the first poll after opting in is the pilot asking to be told)', () => {
    const next = spSnapshot([{ totalSp: FLOOR + 500_000, thresholdSp: 500_000 }]);
    expect(diffSpExtractionReady(1, undefined, next)).toEqual([
      { eventId: 'spExtractionReady', characterId: 1 },
    ]);
  });

  it('fires nothing on the first-ever poll if not yet ready', () => {
    const next = spSnapshot([{ totalSp: FLOOR + 400_000, thresholdSp: 500_000 }]);
    expect(diffSpExtractionReady(1, undefined, next)).toEqual([]);
  });

  it('fires once extractable SP crosses the threshold', () => {
    const prev = spSnapshot([{ totalSp: FLOOR + 400_000, thresholdSp: 500_000 }]);
    const next = spSnapshot([{ totalSp: FLOOR + 500_000, thresholdSp: 500_000 }]);
    expect(diffSpExtractionReady(7, prev, next)).toEqual([
      { eventId: 'spExtractionReady', characterId: 7 },
    ]);
  });

  it('does not re-fire on every poll while it stays ready', () => {
    const prev = spSnapshot([{ totalSp: FLOOR + 500_000, thresholdSp: 500_000 }]);
    const next = spSnapshot([{ totalSp: FLOOR + 600_000, thresholdSp: 500_000 }]);
    expect(diffSpExtractionReady(7, prev, next)).toEqual([]);
  });

  it('fires again after dropping below and crossing back up (e.g. after an extraction)', () => {
    const wasReady = spSnapshot([{ totalSp: FLOOR + 500_000, thresholdSp: 500_000 }]);
    const droppedBack = spSnapshot([{ totalSp: FLOOR, thresholdSp: 500_000 }]);
    const readyAgain = spSnapshot([{ totalSp: FLOOR + 500_000, thresholdSp: 500_000 }]);

    expect(diffSpExtractionReady(7, wasReady, droppedBack)).toEqual([]);
    expect(diffSpExtractionReady(7, droppedBack, readyAgain)).toEqual([
      { eventId: 'spExtractionReady', characterId: 7 },
    ]);
  });

  it('never fires for a character nowhere near the floor, even well above the threshold on total SP alone', () => {
    // The bug this guards against end-to-end: a naive totalSp >= threshold
    // check would fire for every fresh character within days.
    const prev = spSnapshot([{ totalSp: 400_000, thresholdSp: 500_000 }]);
    const next = spSnapshot([{ totalSp: 1_000_000, thresholdSp: 500_000 }]);
    expect(diffSpExtractionReady(7, prev, next)).toEqual([]);
  });
});

describe('SKILL_QUEUE_NOTIFICATION_DIFFS', () => {
  it('registers all three events by id', () => {
    expect(Object.keys(SKILL_QUEUE_NOTIFICATION_DIFFS).sort()).toEqual([
      'characterNotTraining',
      'skillLevelComplete',
      'skillQueueEnding',
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
    const { skillLevelComplete, characterNotTraining } = SKILL_QUEUE_NOTIFICATION_DIFFS;
    expect([
      ...skillLevelComplete(7, completionPrev, completionNext),
      ...characterNotTraining(7, completionPrev, completionNext),
    ]).toEqual([
      { eventId: 'skillLevelComplete', characterId: 7, skillId: 1, level: 3, finishMs: T0 + 1000 },
    ]);
  });
});
