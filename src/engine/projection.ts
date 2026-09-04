/**
 * The Projection engine (ADR 0010, CONTEXT.md round 44, issue #355): turns
 * what a Character's already-fetched snapshot data says about the future
 * into Projection rows the Scheduled Push backend can fire later without an
 * EVE token or an ESI call of its own.
 *
 * Each row carries the Occurrence Key (`occurrenceKey.ts` — the identical
 * function the Foreground Poller keys its own fires with), a `fireAt`, and
 * already-rendered title/body text. For every event but `characterNotTraining`
 * the key derives from a fixed natural id (a finish time, a job id, an expiry),
 * so a device and the backend always agree. `characterNotTraining` alone has
 * no natural id and buckets on `nowMs` at day granularity instead
 * (`occurrenceKey.ts`); this module passes the projected `fireAt` as that
 * bucket source — the closest available proxy for "the day this actually
 * happens" — but a live poll that only observes the transition after the
 * next UTC midnight still lands in a different bucket. That gap is inherent
 * to `occurrenceKey.ts`'s existing day-bucket design (#348), not something
 * this module can close on its own; `projection.test.ts` documents it rather
 * than papering over it.
 *
 * Rendering happens here, not in a later view: nothing else will ever render
 * this text, and the backend holds no SDE or i18n catalog to render it from
 * structured data (round 44 scope decision: "Projection rows carry rendered
 * text, not structured data"). That is also why this module takes
 * already-resolved names as plain values rather than looking them up itself
 * — `src/engine` stays free of Dexie/fetch/DOM (and, since Cloud Functions
 * import this module directly per ADR 0010, free of `src/i18n`'s React
 * coupling too) — the caller resolves names at the feature-layer boundary
 * (ARCHITECTURE.md) and hands them in. For the same reason the English copy
 * below is written out directly rather than pulled from
 * `src/i18n/locales/en.json`'s `notifications.fired.*` keys (which
 * `foregroundPoller.ts`'s `notificationText` renders for the *live* path);
 * the two intentionally read the same today — keep them in sync by hand if
 * either wording changes, since nothing enforces that automatically.
 *
 * Only 7 of the 17 Notification Events carry a timestamp fixed far enough in
 * advance to be worth projecting; the rest are inherently "as it happens"
 * (new mail, a filled order, a wallet change) and have no seat here.
 */
import {
  type SkillQueueEntrySnapshot,
  type IndustryJobEntrySnapshot,
  type ColonySnapshotEntry,
  type CalendarEventEntrySnapshot,
  type StructureFuelEntrySnapshot,
  type NotificationFire,
  type IndustryJobNotificationFire,
  type PlanetaryNotificationFire,
  type ExtractorExpiringFire,
  type CalendarEventStartingFire,
  type StructureFuelLowFire,
  EXTRACTOR_EXPIRY_WARNING_MS,
} from './notificationDiffs';
import { occurrenceKey, type OccurrenceFire } from './occurrenceKey';

export type ProjectableEventId =
  | 'skillLevelComplete'
  | 'characterNotTraining'
  | 'industryJobComplete'
  | 'planetaryExtractionDone'
  | 'planetaryExtractorExpiring'
  | 'calendarEventStarting'
  | 'structureFuelLow';

export type ProjectionWording = 'assert' | 'hedge';

/**
 * `structureFuelLow` hedges ("was due to run out") because a refuel
 * performed in game while the app is closed makes the alert plainly wrong
 * and the backend cannot check; every other projectable event rarely
 * changes once its timestamp is fixed, so it asserts.
 */
export function projectionWording(eventId: ProjectableEventId): ProjectionWording {
  switch (eventId) {
    case 'structureFuelLow':
      return 'hedge';
    case 'skillLevelComplete':
    case 'characterNotTraining':
    case 'industryJobComplete':
    case 'planetaryExtractionDone':
    case 'planetaryExtractorExpiring':
    case 'calendarEventStarting':
      return 'assert';
    default: {
      const exhaustive: never = eventId;
      throw new Error(`projectionWording: unhandled event ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** How far ahead a Projection reaches (round 44: the Projection Horizon). */
export const PROJECTION_HORIZON_MS = 72 * 3_600_000;

export interface ProjectionRow {
  readonly characterId: number;
  readonly eventId: ProjectableEventId;
  readonly occurrenceKey: string;
  readonly fireAt: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Strictly future and within the horizon. `fireAt === nowMs` is excluded —
 * that occurrence is the live Foreground Poller's to report, not a future
 * one to project — and `fireAt === nowMs + horizonMs` is included, matching
 * "covering the next 72 hours" inclusively at the far edge.
 */
function inHorizon(fireAt: number, nowMs: number, horizonMs: number): boolean {
  return fireAt > nowMs && fireAt <= nowMs + horizonMs;
}

/**
 * Builds a row's `{ title, body }` from `projectionWording(eventId)` — never
 * from a template picked independently of it. `assertWording` turns a future
 * change to `projectionWording`'s mapping that a template wasn't updated to
 * match into an immediate thrown error under test, rather than two
 * independently-maintained switches that can silently drift apart (AC4:
 * wording must actually be *applied*, not just computed and unused).
 */
function assertWording(eventId: ProjectableEventId, expected: ProjectionWording): void {
  const actual = projectionWording(eventId);
  if (actual !== expected) {
    throw new Error(
      `projection: ${eventId} is wired to a '${expected}' template but projectionWording says '${actual}'`
    );
  }
}

function buildRow(
  characterId: number,
  eventId: ProjectableEventId,
  fire: OccurrenceFire,
  fireAt: number,
  text: { title: string; body: string }
): ProjectionRow {
  return {
    characterId,
    eventId,
    occurrenceKey: occurrenceKey(fire, fireAt),
    fireAt,
    title: text.title,
    body: text.body,
  };
}

function skillLevelCompleteText(characterName: string, skillName: string, level: number) {
  assertWording('skillLevelComplete', 'assert');
  return {
    title: 'Skill training complete',
    body: `${characterName} finished training ${skillName} ${level}.`,
  };
}

function characterNotTrainingText(characterName: string) {
  assertWording('characterNotTraining', 'assert');
  return {
    title: 'Not training',
    body: `${characterName} has no skill in training.`,
  };
}

function industryJobCompleteText(characterName: string, itemName: string) {
  assertWording('industryJobComplete', 'assert');
  return {
    title: 'Industry job complete',
    body: `${characterName}'s industry job for ${itemName} is complete.`,
  };
}

function planetaryExtractionDoneText(characterName: string, planetName: string) {
  assertWording('planetaryExtractionDone', 'assert');
  return {
    title: 'Extraction done',
    body: `${characterName}'s extraction on ${planetName} has stopped.`,
  };
}

function planetaryExtractorExpiringText(
  characterName: string,
  planetName: string,
  thresholdMs: number
) {
  assertWording('planetaryExtractorExpiring', 'assert');
  const hours = Math.round(thresholdMs / 3_600_000);
  return {
    title: 'Extractor expiring',
    body: `${characterName}'s extractor on ${planetName} expires in under ${hours} hours.`,
  };
}

function calendarEventStartingText(characterName: string) {
  assertWording('calendarEventStarting', 'assert');
  return {
    title: 'Calendar event starting',
    body: `${characterName}'s calendar event is starting.`,
  };
}

/**
 * The one event that hedges (`projectionWording('structureFuelLow')` ===
 * `'hedge'`): "was due to run out" rather than "is low", because a refuel
 * performed in game while the app is closed makes the assertive phrasing
 * plainly wrong and the backend cannot check before the push goes out.
 */
function structureFuelLowText(characterName: string, structureName: string) {
  assertWording('structureFuelLow', 'hedge');
  return {
    title: 'Structure fuel low',
    body: `${characterName}: ${structureName} was due to run out of fuel.`,
  };
}

function sortedByQueuePosition(
  entries: readonly SkillQueueEntrySnapshot[]
): SkillQueueEntrySnapshot[] {
  return [...entries].sort((a, b) => a.queuePosition - b.queuePosition);
}

/**
 * Every entry but the last that finishes inside the horizon projects
 * `skillLevelComplete` — the game auto-advances to the next queued entry, so
 * only the *last* entry's finish is the point training actually stops
 * (`characterNotTraining`), matching `notificationDiffs.ts`'s live
 * `hasMoreBehind` distinction without needing a previous poll to compare
 * against.
 */
export function projectSkillQueue(
  characterId: number,
  characterName: string,
  entries: readonly SkillQueueEntrySnapshot[],
  skillNames: ReadonlyMap<number, string>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const ordered = sortedByQueuePosition(entries);
  const rows: ProjectionRow[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const entry = ordered[i];
    if (entry.finishMs === null || !inHorizon(entry.finishMs, nowMs, horizonMs)) continue;
    const fire: NotificationFire = {
      eventId: 'skillLevelComplete',
      characterId,
      skillId: entry.skillId,
      level: entry.finishedLevel,
      finishMs: entry.finishMs,
    };
    const skillName = skillNames.get(entry.skillId) ?? `#${entry.skillId}`;
    rows.push(
      buildRow(
        characterId,
        'skillLevelComplete',
        fire,
        entry.finishMs,
        skillLevelCompleteText(characterName, skillName, entry.finishedLevel)
      )
    );
  }
  const last = ordered[ordered.length - 1];
  if (last !== undefined && last.finishMs !== null && inHorizon(last.finishMs, nowMs, horizonMs)) {
    const fire: NotificationFire = {
      eventId: 'characterNotTraining',
      characterId,
      skillId: null,
      level: null,
      finishMs: null,
    };
    rows.push(
      buildRow(
        characterId,
        'characterNotTraining',
        fire,
        last.finishMs,
        characterNotTrainingText(characterName)
      )
    );
  }
  return rows;
}

export function projectIndustryJobs(
  characterId: number,
  characterName: string,
  entries: readonly IndustryJobEntrySnapshot[],
  itemNames: ReadonlyMap<number, string>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (!inHorizon(entry.endMs, nowMs, horizonMs)) continue;
    const itemTypeId = entry.productTypeId ?? entry.blueprintTypeId;
    const fire: IndustryJobNotificationFire = {
      eventId: 'industryJobComplete',
      characterId,
      jobId: entry.jobId,
      blueprintTypeId: entry.blueprintTypeId,
      productTypeId: entry.productTypeId,
      activityId: entry.activityId,
    };
    const itemName = itemNames.get(itemTypeId) ?? `#${itemTypeId}`;
    rows.push(
      buildRow(
        characterId,
        'industryJobComplete',
        fire,
        entry.endMs,
        industryJobCompleteText(characterName, itemName)
      )
    );
  }
  return rows;
}

/**
 * `planetaryExtractionDone` keys on the colony's soonest extractor expiry
 * (`notificationDiffs.ts:274`'s `Math.min`, matching `colonyStatus.ts`'s idle
 * read) — one row per colony. `planetaryExtractorExpiring` is the opposite
 * granularity: one row per extractor per lead-time window it will cross
 * inside the horizon, so a single pin can project up to
 * `EXTRACTOR_EXPIRY_WARNING_MS.length` rows.
 */
export function projectColonies(
  characterId: number,
  characterName: string,
  colonies: readonly ColonySnapshotEntry[],
  planetNames: ReadonlyMap<number, string>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const colony of colonies) {
    if (colony.extractors.length === 0) continue;
    const planetName = planetNames.get(colony.planetId) ?? `#${colony.planetId}`;
    const expiryTimeMs = Math.min(...colony.extractors.map((e) => e.expiryTimeMs));
    if (inHorizon(expiryTimeMs, nowMs, horizonMs)) {
      const fire: PlanetaryNotificationFire = {
        eventId: 'planetaryExtractionDone',
        characterId,
        planetId: colony.planetId,
        expiryTimeMs,
      };
      rows.push(
        buildRow(
          characterId,
          'planetaryExtractionDone',
          fire,
          expiryTimeMs,
          planetaryExtractionDoneText(characterName, planetName)
        )
      );
    }
    for (const extractor of colony.extractors) {
      for (const thresholdMs of EXTRACTOR_EXPIRY_WARNING_MS) {
        const fireAt = extractor.expiryTimeMs - thresholdMs;
        if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
        const fire: ExtractorExpiringFire = {
          eventId: 'planetaryExtractorExpiring',
          characterId,
          planetId: colony.planetId,
          pinId: extractor.pinId,
          thresholdMs,
          expiryTimeMs: extractor.expiryTimeMs,
        };
        rows.push(
          buildRow(
            characterId,
            'planetaryExtractorExpiring',
            fire,
            fireAt,
            planetaryExtractorExpiringText(characterName, planetName, thresholdMs)
          )
        );
      }
    }
  }
  return rows;
}

export function projectCalendar(
  characterId: number,
  characterName: string,
  entries: readonly CalendarEventEntrySnapshot[],
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (!inHorizon(entry.startMs, nowMs, horizonMs)) continue;
    const fire: CalendarEventStartingFire = {
      eventId: 'calendarEventStarting',
      characterId,
      calendarEventId: entry.calendarEventId,
    };
    rows.push(
      buildRow(
        characterId,
        'calendarEventStarting',
        fire,
        entry.startMs,
        calendarEventStartingText(characterName)
      )
    );
  }
  return rows;
}

/**
 * `entry.thresholdMs` is already baked in per entry at `pollDomains.ts`'s
 * `load()` time (the Character's current fuel lead time, read fresh every
 * poll) — pure snapshot arithmetic here, no preference lookup needed.
 */
export function projectStructureFuel(
  characterId: number,
  characterName: string,
  entries: readonly StructureFuelEntrySnapshot[],
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (entry.fuelExpiresMs === null) continue;
    const fireAt = entry.fuelExpiresMs - entry.thresholdMs;
    if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
    const fire: StructureFuelLowFire = {
      eventId: 'structureFuelLow',
      characterId,
      structureId: entry.structureId,
      structureName: entry.name,
      thresholdMs: entry.thresholdMs,
      fuelExpiresMs: entry.fuelExpiresMs,
    };
    rows.push(
      buildRow(
        characterId,
        'structureFuelLow',
        fire,
        fireAt,
        structureFuelLowText(characterName, entry.name)
      )
    );
  }
  return rows;
}
