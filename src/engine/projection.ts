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
 * (ARCHITECTURE.md) and hands them in.
 *
 * The wording itself is not written here either: each `project*` takes the
 * owning domain's push renderer (`PushCopy`, declared beside that domain's
 * live wording in `features/notifications/domainCopy.ts`, issue #1249, and
 * named on each event's Event Entry, issue #1285), so an
 * event's poll and push copy sit side by side. Those renderers are plain
 * functions of their arguments — no i18next, no lookups — which keeps this
 * module as pure as before.
 *
 * 9 of the 22 Notification Events carry a timestamp fixed far enough in
 * advance to be worth projecting; the rest are inherently "as it happens"
 * (new mail, a filled order, a wallet change) and have no seat here. EVE's
 * own notifications are mostly the same "as it happens" case — except a
 * structure reinforcement's `timeLeft` payload field, whose derived exit
 * instant (round 36) is exactly the kind of future timestamp this module
 * projects (issue #359).
 */
import {
  type SkillQueueEntrySnapshot,
  type IndustryJobEntrySnapshot,
  type ColonySnapshotEntry,
  type CalendarEventEntrySnapshot,
  type StructureFuelEntrySnapshot,
  type EveNotificationEntrySnapshot,
  type NotificationFire,
  type IndustryJobNotificationFire,
  type PlanetaryNotificationFire,
  type ExtractorExpiringFire,
  type CalendarEventStartingFire,
  type StructureFuelLowFire,
  type StructureReinforcementExitFire,
} from './notificationDiffs';
import { reinforcementExitMs, parseEveNotificationPayload } from './eveNotificationPayload';
import { occurrenceKey, type OccurrenceFire } from './occurrenceKey';
import type { NotificationCopy } from './notificationWording';

/** Matches the Roman-numeral formatting every skill-level display in the app uses. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
export const romanLevel = (level: number): string => ROMAN[level - 1] ?? String(level);

/**
 * Every Notification Event a Projection can be built for — the ones whose
 * occurrence has a knowable future timestamp, so the backend can schedule the
 * push ahead of time and the alert arrives with the app closed. Everything
 * else is only observable by polling, which needs the app open.
 *
 * The union below is derived from this array rather than written twice. The
 * feature layer's Event Entry catalog (`features/notifications/eventEntries.ts`,
 * issue #1285) is typed against it per event: an id listed here must declare a
 * push renderer there, and any other must declare none — so the two cannot
 * drift, and Settings' Scheduled Push badge reads the entries.
 */
export const PROJECTABLE_EVENT_IDS = [
  'skillLevelComplete',
  'characterNotTraining',
  'skillQueueEnding',
  'industryJobComplete',
  'planetaryExtractionDone',
  'planetaryExtractorExpiring',
  'calendarEventStarting',
  'structureFuelLow',
  'eveNotification',
] as const;

export type ProjectableEventId = (typeof PROJECTABLE_EVENT_IDS)[number];

export type ProjectionWording = 'assert' | 'hedge';

/**
 * A Projection is a prediction nothing re-checks before it fires (ADR 0010:
 * "the backend cannot verify a Projection before firing it"). An event
 * hedges when an ordinary in-game action, taken while the app is closed,
 * routinely falsifies that prediction before it lands.
 *
 * Four do. `structureFuelLow` is falsified by a refuel. Both planetary
 * events are falsified by the move a pilot makes on every reset run —
 * stopping an extractor program and installing a new one. `skillQueueEnding`
 * (issue #1410) is falsified the same way by topping up the skill queue in
 * the EVE client — the app itself cannot write to the queue, but the game
 * client always can, with the app closed or open. That is not an edge case
 * for any of the four; it is the whole activity each event exists to prompt,
 * so a pilot who acts on the warning with the app closed is precisely the
 * one who then gets told their queue was about to run dry.
 *
 * Everything else rarely changes once its timestamp is fixed — a queued
 * skill about to *complete* (as opposed to the queue running dry behind it),
 * a started job, a scheduled calendar event — so it asserts.
 *
 * This governs the **push** path only. The Foreground Poller has genuinely
 * observed what it reports, so its copy stays assertive
 * (`notificationWording.ts`'s `SHARED_NOTIFICATION_WORDING`, spliced into
 * `notifications.fired.*` by `src/i18n/index.ts`). That split is why the
 * hedged push text (`features/notifications/domainCopy.ts`) is written out
 * inline rather than rendered from a shared template.
 */
export function projectionWording(eventId: ProjectableEventId): ProjectionWording {
  switch (eventId) {
    case 'structureFuelLow':
    case 'planetaryExtractionDone':
    case 'planetaryExtractorExpiring':
    case 'skillQueueEnding':
      return 'hedge';
    case 'skillLevelComplete':
    case 'characterNotTraining':
    case 'industryJobComplete':
    case 'calendarEventStarting':
    case 'eveNotification':
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
  /**
   * The raw ESI type underneath an `eveNotification` row (issue #274's
   * per-type opt-out), carried through so a push-delivered occurrence can be
   * muted per-type exactly like the Foreground Poller's own feed write
   * (`foregroundPoller.ts`'s `recordFeedEntry` call) — absent for every other
   * `ProjectableEventId`, which has no type underneath it to carry.
   */
  readonly eveType?: string;
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
 * A domain's push renderer: the rendered text for one projected fire. `names`
 * carries whatever display names the text needs, already resolved by the
 * caller (this module never looks anything up); a name that failed to resolve
 * is simply absent, and the renderer owns the fallback.
 */
export type PushCopy<TFire, TNames> = (
  fire: TFire,
  characterName: string,
  names: TNames
) => NotificationCopy;

/**
 * Every push renderer calls this with the wording its template actually
 * makes, so a future change to `projectionWording`'s mapping that a template
 * wasn't updated to match throws under test, rather than two
 * independently-maintained switches silently drifting apart (AC4: wording
 * must actually be *applied*, not just computed and unused).
 */
export function assertProjectionWording(
  eventId: ProjectableEventId,
  expected: ProjectionWording
): void {
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
  text: NotificationCopy,
  eveType?: string
): ProjectionRow {
  return {
    characterId,
    eventId,
    occurrenceKey: occurrenceKey(fire, fireAt),
    fireAt,
    title: text.title,
    body: text.body,
    ...(eveType !== undefined ? { eveType } : {}),
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
 * against. That same last entry also projects `skillQueueEnding` (issue
 * #1410) at its own, earlier `finishMs - endingLeadMs` instant — a distinct
 * warning ahead of the queue actually running dry, not a duplicate of
 * `characterNotTraining`.
 */
export function projectSkillQueue(
  characterId: number,
  characterName: string,
  entries: readonly SkillQueueEntrySnapshot[],
  skillNames: ReadonlyMap<number, string>,
  copy: PushCopy<NotificationFire, { skill?: string }>,
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
    rows.push(
      buildRow(
        characterId,
        'skillLevelComplete',
        fire,
        entry.finishMs,
        copy(fire, characterName, { skill: skillNames.get(entry.skillId) })
      )
    );
  }
  const last = ordered[ordered.length - 1];
  if (last !== undefined && last.finishMs !== null) {
    const finishMs = last.finishMs;
    if (inHorizon(finishMs, nowMs, horizonMs)) {
      const fire: NotificationFire = {
        eventId: 'characterNotTraining',
        characterId,
        skillId: null,
        level: null,
        finishMs: null,
      };
      rows.push(
        buildRow(characterId, 'characterNotTraining', fire, finishMs, copy(fire, characterName, {}))
      );
    }
    // The tail's own warning (issue #1410) — a distinct fire from
    // `characterNotTraining` above: this one still has queue behind it to
    // point to (`skillId`/`level`), and fires at `finishMs - endingLeadMs`
    // rather than at `finishMs` itself. `endingLeadMs` is absent when the
    // Character has none baked onto this entry (`pollDomains.ts`'s
    // `skillQueueDomain.projection` always bakes the current one in before
    // calling this, so absence here only ever means "not yet observed").
    if (last.endingLeadMs !== undefined) {
      const fireAt = finishMs - last.endingLeadMs;
      if (inHorizon(fireAt, nowMs, horizonMs)) {
        const fire: NotificationFire = {
          eventId: 'skillQueueEnding',
          characterId,
          skillId: last.skillId,
          level: last.finishedLevel,
          finishMs,
          thresholdMs: last.endingLeadMs,
        };
        rows.push(
          buildRow(
            characterId,
            'skillQueueEnding',
            fire,
            fireAt,
            copy(fire, characterName, { skill: skillNames.get(last.skillId) })
          )
        );
      }
    }
  }
  return rows;
}

export function projectIndustryJobs(
  characterId: number,
  characterName: string,
  entries: readonly IndustryJobEntrySnapshot[],
  itemNames: ReadonlyMap<number, string>,
  copy: PushCopy<IndustryJobNotificationFire, { item?: string }>,
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
    rows.push(
      buildRow(
        characterId,
        'industryJobComplete',
        fire,
        entry.endMs,
        copy(fire, characterName, { item: itemNames.get(itemTypeId) })
      )
    );
  }
  return rows;
}

/**
 * `planetaryExtractionDone` keys on the colony's soonest extractor expiry
 * (`notificationDiffs.ts:274`'s `Math.min`, matching `colonyStatus.ts`'s idle
 * read) — one row per colony. `planetaryExtractorExpiring` is the opposite
 * granularity: one row per extractor, at that extractor's own baked-in
 * `thresholdMs` (the Character's configured lead time), if that fire lands
 * inside the horizon.
 */
export function projectColonies(
  characterId: number,
  characterName: string,
  colonies: readonly ColonySnapshotEntry[],
  planetNames: ReadonlyMap<number, string>,
  copy: PushCopy<PlanetaryNotificationFire | ExtractorExpiringFire, { planet?: string }>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const colony of colonies) {
    if (colony.extractors.length === 0) continue;
    const names = { planet: planetNames.get(colony.planetId) };
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
          copy(fire, characterName, names)
        )
      );
    }
    for (const extractor of colony.extractors) {
      const fireAt = extractor.expiryTimeMs - extractor.thresholdMs;
      if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
      const fire: ExtractorExpiringFire = {
        eventId: 'planetaryExtractorExpiring',
        characterId,
        planetId: colony.planetId,
        pinId: extractor.pinId,
        thresholdMs: extractor.thresholdMs,
        expiryTimeMs: extractor.expiryTimeMs,
      };
      rows.push(
        buildRow(
          characterId,
          'planetaryExtractorExpiring',
          fire,
          fireAt,
          copy(fire, characterName, names)
        )
      );
    }
  }
  return rows;
}

export function projectCalendar(
  characterId: number,
  characterName: string,
  entries: readonly CalendarEventEntrySnapshot[],
  copy: PushCopy<CalendarEventStartingFire, Record<string, never>>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (entry.response === 'declined') continue;
    if (!inHorizon(entry.startMs, nowMs, horizonMs)) continue;
    const fire: CalendarEventStartingFire = {
      eventId: 'calendarEventStarting',
      characterId,
      calendarEventId: entry.calendarEventId,
      ...(entry.title === undefined ? {} : { title: entry.title }),
    };
    rows.push(
      buildRow(
        characterId,
        'calendarEventStarting',
        fire,
        entry.startMs,
        copy(fire, characterName, {})
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
  copy: PushCopy<StructureFuelLowFire, Record<string, never>>,
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
      buildRow(characterId, 'structureFuelLow', fire, fireAt, copy(fire, characterName, {}))
    );
  }
  return rows;
}

/**
 * A structure reinforcement's exit instant (round 36: the notification's own
 * timestamp plus the payload's `timeLeft` duration), for every
 * EVE Notification entry whose payload has one and whose exit falls inside
 * the horizon (issue #359). Parsing is type-agnostic — `timeLeft` means the
 * same thing wherever it appears, and CCP's own catalog of which types carry
 * it is not this module's to hardcode — so any entry lacking a usable one is
 * silently skipped rather than filtered by `type` first.
 *
 * The row's `eventId` stays `'eveNotification'` (matching this domain's only
 * `NotificationEventId`, so `foregroundPoller.ts`'s `enabledEvents` filter
 * lets it through), but its Occurrence Key derives from a distinct synthetic
 * `StructureReinforcementExitFire` rather than `EveNotificationFire` — see
 * that type's doc comment in `notificationDiffs.ts` for why reusing the
 * plain fire would collide with the live "lost shields/armor" fire sharing
 * the same `notificationId`.
 */
/**
 * The structure ids `projectEveNotificationReinforcementExit` will actually
 * put in a row's text, for a caller that has to resolve display names first
 * (`features/notifications/pollDomains.ts`'s `eveNotificationDomain`
 * projection — `src/engine` stays free of the ESI call that resolves a name,
 * per this module's own header). Runs the identical `reinforcementExitMs` +
 * `inHorizon` gate `projectEveNotificationReinforcementExit` runs, so an
 * entry excluded here is exactly an entry that function would have produced
 * no row for — there is no ESI call this skips that a name would have
 * appeared in. Callers must pass the same `nowMs` to both functions: an
 * entry that passes this gate and fails the projector's (or vice versa) would
 * fall back to rendering `#id` for a lookup that either wasn't attempted or
 * was wasted.
 */
export function reinforcementExitStructureIds(
  entries: readonly EveNotificationEntrySnapshot[],
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): number[] {
  const ids: number[] = [];
  for (const entry of entries) {
    const payload = parseEveNotificationPayload(entry.text);
    const exitMs = reinforcementExitMs(entry.timestamp, payload);
    if (exitMs === undefined) continue;
    if (!inHorizon(exitMs, nowMs, horizonMs)) continue;
    if (payload.structureId !== undefined) ids.push(payload.structureId);
  }
  return ids;
}

/** What a reinforcement-exit push can name its structure by, best first. */
export interface ReinforcementExitNames {
  readonly payloadStructureName?: string;
  readonly resolvedStructureName?: string;
  readonly structureId?: number;
}

export function projectEveNotificationReinforcementExit(
  characterId: number,
  characterName: string,
  entries: readonly EveNotificationEntrySnapshot[],
  structureNames: ReadonlyMap<number, string>,
  copy: PushCopy<StructureReinforcementExitFire, ReinforcementExitNames>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    const payload = parseEveNotificationPayload(entry.text);
    const exitMs = reinforcementExitMs(entry.timestamp, payload);
    if (exitMs === undefined) continue;
    if (!inHorizon(exitMs, nowMs, horizonMs)) continue;
    const names: ReinforcementExitNames = {
      payloadStructureName: payload.structureName,
      resolvedStructureName:
        payload.structureId === undefined ? undefined : structureNames.get(payload.structureId),
      structureId: payload.structureId,
    };
    const fire: StructureReinforcementExitFire = {
      eventId: 'structureReinforcementExit',
      characterId,
      notificationId: entry.notificationId,
    };
    rows.push(
      buildRow(
        characterId,
        'eveNotification',
        fire,
        exitMs,
        copy(fire, characterName, names),
        entry.type
      )
    );
  }
  return rows;
}
