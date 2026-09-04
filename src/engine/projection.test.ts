import { describe, it, expect } from 'vitest';
import {
  PROJECTION_HORIZON_MS,
  projectionWording,
  projectSkillQueue,
  projectIndustryJobs,
  projectColonies,
  projectCalendar,
  projectStructureFuel,
  projectEveNotificationReinforcementExit,
} from './projection';
import { occurrenceKey } from './occurrenceKey';
import type { NotificationFire, EveNotificationEntrySnapshot } from './notificationDiffs';
import { EXTRACTOR_EXPIRY_WARNING_MS } from './notificationDiffs';

const T0 = 1_700_000_000_000;
const HOUR_MS = 3_600_000;

describe('projectionWording', () => {
  it('hedges structureFuelLow because a refuel while the app is closed can make it wrong', () => {
    expect(projectionWording('structureFuelLow')).toEqual('hedge');
  });

  it('asserts every other projectable event', () => {
    const asserted: Parameters<typeof projectionWording>[0][] = [
      'skillLevelComplete',
      'characterNotTraining',
      'industryJobComplete',
      'planetaryExtractionDone',
      'planetaryExtractorExpiring',
      'calendarEventStarting',
      'eveNotification',
    ];
    for (const eventId of asserted) {
      expect(projectionWording(eventId)).toEqual('assert');
    }
  });
});

describe('projectSkillQueue', () => {
  it('projects skillLevelComplete for every entry but the last, and characterNotTraining for the last', () => {
    const entries = [
      { skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: T0 + 10 * HOUR_MS },
      { skillId: 2, finishedLevel: 1, queuePosition: 1, finishMs: T0 + 20 * HOUR_MS },
    ];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map([[1, 'Gunnery']]), T0);
    expect(rows).toHaveLength(2);
    expect(rows[0].eventId).toEqual('skillLevelComplete');
    expect(rows[0].fireAt).toEqual(T0 + 10 * HOUR_MS);
    expect(rows[0].title).toEqual('Skill training complete');
    expect(rows[0].body).toContain('Gunnery');
    expect(rows[1].eventId).toEqual('characterNotTraining');
    expect(rows[1].fireAt).toEqual(T0 + 20 * HOUR_MS);
  });

  it('projects only characterNotTraining for a single-entry queue', () => {
    const entries = [
      { skillId: 1, finishedLevel: 5, queuePosition: 0, finishMs: T0 + 5 * HOUR_MS },
    ];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map(), T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toEqual('characterNotTraining');
  });

  it('produces no row and no error for an entry with no finish date (paused/stalled)', () => {
    const entries = [{ skillId: 1, finishedLevel: 5, queuePosition: 0, finishMs: null }];
    expect(() => projectSkillQueue(7, 'Kestrel', entries, new Map(), T0)).not.toThrow();
    expect(projectSkillQueue(7, 'Kestrel', entries, new Map(), T0)).toEqual([]);
  });

  it('produces no rows for an empty queue', () => {
    expect(projectSkillQueue(7, 'Kestrel', [], new Map(), T0)).toEqual([]);
  });

  it('falls back to #id when a skill name is not resolved', () => {
    const entries = [
      { skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: T0 + 10 * HOUR_MS },
      { skillId: 2, finishedLevel: 1, queuePosition: 1, finishMs: T0 + 20 * HOUR_MS },
    ];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map(), T0);
    expect(rows[0].body).toContain('#1');
  });

  it('excludes an entry finishing exactly now and includes one finishing exactly at the horizon edge', () => {
    const entries = [
      { skillId: 1, finishedLevel: 1, queuePosition: 0, finishMs: T0 },
      { skillId: 2, finishedLevel: 1, queuePosition: 1, finishMs: T0 + PROJECTION_HORIZON_MS },
    ];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map(), T0);
    // Position 0 (fireAt === nowMs) never becomes a skillLevelComplete row (it's
    // not the last entry, but it's also not in the future), and position 1 (the
    // last entry, fireAt exactly at the horizon edge) is included.
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toEqual('characterNotTraining');
    expect(rows[0].fireAt).toEqual(T0 + PROJECTION_HORIZON_MS);
  });

  it('excludes an entry finishing one ms beyond the horizon', () => {
    const entries = [
      { skillId: 1, finishedLevel: 1, queuePosition: 0, finishMs: T0 + PROJECTION_HORIZON_MS + 1 },
    ];
    expect(projectSkillQueue(7, 'Kestrel', entries, new Map(), T0)).toEqual([]);
  });

  it('keys characterNotTraining by the day the queue actually goes idle (fireAt), not the projection day — the best available proxy for what the Foreground Poller will later see, though not a guarantee (see projection.ts header)', () => {
    const finishMs = T0 + 60 * HOUR_MS; // lands on a different UTC day than T0
    const entries = [{ skillId: 1, finishedLevel: 5, queuePosition: 0, finishMs }];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map(), T0);
    const fire: NotificationFire = {
      eventId: 'characterNotTraining',
      characterId: 7,
      skillId: null,
      level: null,
      finishMs: null,
    };
    expect(rows[0].occurrenceKey).toEqual(occurrenceKey(fire, finishMs));
    expect(rows[0].occurrenceKey).not.toEqual(occurrenceKey(fire, T0));
  });

  it('agrees with the Foreground Poller on skillLevelComplete keys, which do not depend on nowMs', () => {
    const entries = [
      { skillId: 3300, finishedLevel: 4, queuePosition: 0, finishMs: T0 + 10 * HOUR_MS },
      { skillId: 2, finishedLevel: 1, queuePosition: 1, finishMs: T0 + 20 * HOUR_MS },
    ];
    const rows = projectSkillQueue(7, 'Kestrel', entries, new Map(), T0);
    const fire: NotificationFire = {
      eventId: 'skillLevelComplete',
      characterId: 7,
      skillId: 3300,
      level: 4,
      finishMs: T0 + 10 * HOUR_MS,
    };
    expect(rows[0].occurrenceKey).toEqual(occurrenceKey(fire, T0 + 999_999));
  });
});

describe('projectIndustryJobs', () => {
  it('projects one row per job inside the horizon, resolving the item name', () => {
    const entries = [
      { jobId: 1, endMs: T0 + 5 * HOUR_MS, blueprintTypeId: 10, productTypeId: 20, activityId: 1 },
    ];
    const rows = projectIndustryJobs(7, 'Kestrel', entries, new Map([[20, 'Rifter']]), T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toEqual('industryJobComplete');
    expect(rows[0].fireAt).toEqual(T0 + 5 * HOUR_MS);
    expect(rows[0].body).toContain('Rifter');
  });

  it('uses the blueprint type id when there is no product (e.g. research jobs)', () => {
    const entries = [
      {
        jobId: 1,
        endMs: T0 + 5 * HOUR_MS,
        blueprintTypeId: 10,
        productTypeId: null,
        activityId: 5,
      },
    ];
    const rows = projectIndustryJobs(
      7,
      'Kestrel',
      entries,
      new Map([[10, 'Rifter Blueprint']]),
      T0
    );
    expect(rows[0].body).toContain('Rifter Blueprint');
  });

  it('produces no row for a job already past its end date', () => {
    const entries = [
      { jobId: 1, endMs: T0 - 1, blueprintTypeId: 10, productTypeId: 20, activityId: 1 },
    ];
    expect(projectIndustryJobs(7, 'Kestrel', entries, new Map(), T0)).toEqual([]);
  });
});

describe('projectColonies', () => {
  it('projects planetaryExtractionDone at the soonest extractor expiry across the colony', () => {
    const colonies = [
      {
        planetId: 40000001,
        extractors: [
          { pinId: 1, expiryTimeMs: T0 + 30 * HOUR_MS },
          { pinId: 2, expiryTimeMs: T0 + 10 * HOUR_MS },
        ],
      },
    ];
    const rows = projectColonies(7, 'Kestrel', colonies, new Map([[40000001, 'Amarr III']]), T0);
    const extractionDone = rows.find((r) => r.eventId === 'planetaryExtractionDone');
    expect(extractionDone?.fireAt).toEqual(T0 + 10 * HOUR_MS);
    expect(extractionDone?.body).toContain('Amarr III');
  });

  it('projects up to two planetaryExtractorExpiring rows per extractor, one per lead-time window', () => {
    expect(EXTRACTOR_EXPIRY_WARNING_MS).toEqual([24 * HOUR_MS, 12 * HOUR_MS]);
    const colonies = [
      {
        planetId: 40000001,
        extractors: [{ pinId: 1, expiryTimeMs: T0 + 20 * HOUR_MS }],
      },
    ];
    const rows = projectColonies(7, 'Kestrel', colonies, new Map(), T0);
    const expiring = rows.filter((r) => r.eventId === 'planetaryExtractorExpiring');
    expect(expiring).toHaveLength(1);
    expect(expiring[0].fireAt).toEqual(T0 + 20 * HOUR_MS - 12 * HOUR_MS);
    // Two distinct occurrences must key distinctly even though they share a pin.
    const keys = new Set(expiring.map((r) => r.occurrenceKey));
    expect(keys.size).toEqual(expiring.length);
  });

  it('produces no rows for a colony with no extractors', () => {
    const colonies = [{ planetId: 40000001, extractors: [] }];
    expect(projectColonies(7, 'Kestrel', colonies, new Map(), T0)).toEqual([]);
  });
});

describe('projectCalendar', () => {
  it('projects calendarEventStarting for an event inside the horizon', () => {
    const entries = [{ calendarEventId: 99, startMs: T0 + 5 * HOUR_MS }];
    const rows = projectCalendar(7, 'Kestrel', entries, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toEqual('calendarEventStarting');
    expect(rows[0].fireAt).toEqual(T0 + 5 * HOUR_MS);
  });

  it('produces no row for an event outside the horizon', () => {
    const entries = [{ calendarEventId: 99, startMs: T0 + PROJECTION_HORIZON_MS + 1 }];
    expect(projectCalendar(7, 'Kestrel', entries, T0)).toEqual([]);
  });
});

describe('projectStructureFuel', () => {
  it('projects structureFuelLow, hedged, at fuelExpiresMs minus the lead time', () => {
    const entries = [
      {
        structureId: 111,
        name: 'Keepstar',
        fuelExpiresMs: T0 + 50 * HOUR_MS,
        thresholdMs: 24 * HOUR_MS,
      },
    ];
    const rows = projectStructureFuel(7, 'Kestrel', entries, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].fireAt).toEqual(T0 + 26 * HOUR_MS);
    expect(rows[0].body).toContain('was due to run out');
    expect(rows[0].body).toContain('Keepstar');
  });

  it('produces no row and no error for a structure that has already run dry', () => {
    const entries = [
      { structureId: 111, name: 'Keepstar', fuelExpiresMs: null, thresholdMs: 24 * HOUR_MS },
    ];
    expect(() => projectStructureFuel(7, 'Kestrel', entries, T0)).not.toThrow();
    expect(projectStructureFuel(7, 'Kestrel', entries, T0)).toEqual([]);
  });
});

describe('projectEveNotificationReinforcementExit', () => {
  const T_ISO = new Date(T0).toISOString();

  function entry(
    overrides: Partial<EveNotificationEntrySnapshot> = {}
  ): EveNotificationEntrySnapshot {
    return {
      notificationId: 1,
      type: 'StructureUnderAttack',
      senderId: 1000132,
      senderType: 'corporation',
      // 36,000,000,000 ticks (100ns units) = 3,600,000 ms = 1 hour.
      text: 'structureID: 111\ntimeLeft: 36000000000\n',
      timestamp: T_ISO,
      ...overrides,
    };
  }

  it('projects a row at the derived reinforcement-exit instant, naming the structure', () => {
    const names = new Map([[111, 'Keepstar']]);
    const rows = projectEveNotificationReinforcementExit(7, 'Kestrel', [entry()], names, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].fireAt).toEqual(T0 + HOUR_MS);
    expect(rows[0].body).toContain('Keepstar');
  });

  it("carries the entry's raw eveType, so a push-delivered row can be muted per-type like a live one", () => {
    const rows = projectEveNotificationReinforcementExit(
      7,
      'Kestrel',
      [entry({ type: 'StructureLostShields' })],
      new Map(),
      T0
    );
    expect(rows[0].eveType).toBe('StructureLostShields');
  });

  it('is skipped, without error, when timeLeft is absent', () => {
    const args = [7, 'Kestrel', [entry({ text: 'structureID: 111\n' })], new Map(), T0] as const;
    expect(() => projectEveNotificationReinforcementExit(...args)).not.toThrow();
    expect(projectEveNotificationReinforcementExit(...args)).toEqual([]);
  });

  it('is skipped, without error, when timeLeft is unparseable', () => {
    const rows = projectEveNotificationReinforcementExit(
      7,
      'Kestrel',
      [entry({ text: 'structureID: 111\ntimeLeft: not-a-number\n' })],
      new Map(),
      T0
    );
    expect(rows).toEqual([]);
  });

  it('is skipped when the exit falls outside the 72-hour horizon, and appears once inside it', () => {
    const outsideTicks = (PROJECTION_HORIZON_MS + HOUR_MS) * 10_000;
    const outside = projectEveNotificationReinforcementExit(
      7,
      'Kestrel',
      [entry({ text: `structureID: 111\ntimeLeft: ${outsideTicks}\n` })],
      new Map(),
      T0
    );
    expect(outside).toEqual([]);

    const insideTicks = (PROJECTION_HORIZON_MS - HOUR_MS) * 10_000;
    const inside = projectEveNotificationReinforcementExit(
      7,
      'Kestrel',
      [entry({ text: `structureID: 111\ntimeLeft: ${insideTicks}\n` })],
      new Map(),
      T0
    );
    expect(inside).toHaveLength(1);
  });

  it('degrades to the structure id, then a neutral phrase, when the name cannot be resolved', () => {
    const byId = projectEveNotificationReinforcementExit(7, 'Kestrel', [entry()], new Map(), T0);
    expect(byId[0].body).toContain('111');

    const noId = projectEveNotificationReinforcementExit(
      7,
      'Kestrel',
      [entry({ text: 'timeLeft: 36000000000\n' })],
      new Map(),
      T0
    );
    expect(noId).toHaveLength(1);
    expect(noId[0].body).not.toContain('undefined');
  });
});
