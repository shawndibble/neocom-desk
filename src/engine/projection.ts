import {
  type SkillQueueEntrySnapshot,
  type IndustryJobEntrySnapshot,
  type CloneJumpEntrySnapshot,
  type CloneJumpReadyFire,
  type ContractEntrySnapshot,
  ordersInBatch,
  type OrderExpiryEntrySnapshot,
  type OrdersLapsingFire,
  type ContractNotificationFire,
  type ColonySnapshotEntry,
  type CalendarEventEntrySnapshot,
  type StructureFuelEntrySnapshot,
  type EveNotificationEntrySnapshot,
  type NotificationFire,
  type IndustryJobNotificationFire,
  type CorpIndustryJobEntrySnapshot,
  type CorpIndustryJobNotificationFire,
  type PlanetaryNotificationFire,
  type ExtractorExpiringFire,
  type CalendarEventStartingFire,
  type StructureFuelLowFire,
  type MercenaryDenReinforcedFire,
  type AcceleratorEntrySnapshot,
  type AcceleratorExpiringFire,
  type SkyhookRaidableFire,
  type SkyhookEntrySnapshot,
  openPhase,
  type DenEntrySnapshot,
  type StructureReinforcementExitFire,
  type SharedMoonPopEntrySnapshot,
  type SharedMoonPopFire,
  sharedMoonPopFire,
} from './notificationDiffs';
import { reinforcementExitMs, parseEveNotificationPayload } from './eveNotificationPayload';
import { occurrenceKey, type OccurrenceFire } from './occurrenceKey';
import type { NotificationCopy } from './notificationWording';
import { HOUR_MS } from '@/lib/age';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
export const romanLevel = (level: number): string => ROMAN[level - 1] ?? String(level);

export const PROJECTABLE_EVENT_IDS = [
  'skillLevelComplete',
  'characterNotTraining',
  'skillQueueEnding',
  'courierDeliveryDue',
  'contractExpiring',
  'ordersLapsing',
  'industryJobComplete',
  'cloneJumpReady',
  'planetaryExtractionDone',
  'planetaryExtractorExpiring',
  'calendarEventStarting',
  'structureFuelLow',
  'mercenaryDenReinforced',
  'acceleratorExpiring',
  'skyhookRaidable',
  'corpIndustryJobReady',
  'eveNotification',
  'sharedMoonPop',
] as const;

export type ProjectableEventId = (typeof PROJECTABLE_EVENT_IDS)[number];

export type ProjectionWording = 'assert' | 'hedge';

export function projectionWording(eventId: ProjectableEventId): ProjectionWording {
  switch (eventId) {
    case 'structureFuelLow':
    case 'mercenaryDenReinforced':
    case 'acceleratorExpiring':
    case 'skyhookRaidable':
    case 'planetaryExtractionDone':
    case 'planetaryExtractorExpiring':
    case 'skillQueueEnding':
    case 'courierDeliveryDue':
    case 'contractExpiring':
    case 'ordersLapsing':
      return 'hedge';
    case 'skillLevelComplete':
    case 'characterNotTraining':
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
    case 'cloneJumpReady':
    case 'calendarEventStarting':
    case 'eveNotification':
    case 'sharedMoonPop':
      return 'assert';
    default: {
      const exhaustive: never = eventId;
      throw new Error(`projectionWording: unhandled event ${JSON.stringify(exhaustive)}`);
    }
  }
}

export const PROJECTION_HORIZON_MS = 72 * HOUR_MS;

export interface ProjectionRow {
  readonly characterId: number;
  readonly eventId: ProjectableEventId;
  readonly occurrenceKey: string;
  readonly fireAt: number;
  readonly title: string;
  readonly body: string;
  readonly eveType?: string;
}

function inHorizon(fireAt: number, nowMs: number, horizonMs: number): boolean {
  return fireAt > nowMs && fireAt <= nowMs + horizonMs;
}

export type PushCopy<TFire, TNames> = (
  fire: TFire,
  characterName: string,
  names: TNames
) => NotificationCopy;

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
      endMs: entry.endMs,
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

export function projectCorpIndustryJobs(
  characterId: number,
  characterName: string,
  entries: readonly CorpIndustryJobEntrySnapshot[],
  itemNames: ReadonlyMap<number, string>,
  copy: PushCopy<CorpIndustryJobNotificationFire, { item?: string }>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (!inHorizon(entry.endMs, nowMs, horizonMs)) continue;
    const itemTypeId = entry.productTypeId ?? entry.blueprintTypeId;
    const fire: CorpIndustryJobNotificationFire = {
      eventId: 'corpIndustryJobReady',
      characterId,
      jobId: entry.jobId,
      blueprintTypeId: entry.blueprintTypeId,
      productTypeId: entry.productTypeId,
      activityId: entry.activityId,
      endMs: entry.endMs,
    };
    rows.push(
      buildRow(
        characterId,
        'corpIndustryJobReady',
        fire,
        entry.endMs,
        copy(fire, characterName, { item: itemNames.get(itemTypeId) })
      )
    );
  }
  return rows;
}

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

export function projectContracts(
  characterId: number,
  characterName: string,
  entries: readonly ContractEntrySnapshot[],
  copy: PushCopy<ContractNotificationFire, Record<string, never>>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    const { expiresMs, expiringLeadMs } = entry;
    if (
      entry.status === 'outstanding' &&
      entry.issuerId === characterId &&
      expiresMs !== undefined &&
      expiringLeadMs !== undefined
    ) {
      const expiringAt = expiresMs - expiringLeadMs;
      if (inHorizon(expiringAt, nowMs, horizonMs)) {
        const fire: ContractNotificationFire = {
          eventId: 'contractExpiring',
          characterId,
          contractId: entry.contractId,
          deadlineMs: expiresMs,
          thresholdMs: expiringLeadMs,
        };
        rows.push(
          buildRow(characterId, 'contractExpiring', fire, expiringAt, copy(fire, characterName, {}))
        );
      }
    }
    const { deliveryDeadlineMs, dueLeadMs } = entry;
    if (entry.status !== 'in_progress' || entry.acceptorId !== characterId) continue;
    if (deliveryDeadlineMs === undefined || dueLeadMs === undefined) continue;
    const fireAt = deliveryDeadlineMs - dueLeadMs;
    if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
    const fire: ContractNotificationFire = {
      eventId: 'courierDeliveryDue',
      characterId,
      contractId: entry.contractId,
      deadlineMs: deliveryDeadlineMs,
      thresholdMs: dueLeadMs,
    };
    rows.push(
      buildRow(characterId, 'courierDeliveryDue', fire, fireAt, copy(fire, characterName, {}))
    );
  }
  return rows;
}

export function projectOrdersLapsing(
  characterId: number,
  characterName: string,
  entries: readonly OrderExpiryEntrySnapshot[],
  copy: PushCopy<OrdersLapsingFire, Record<string, never>>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  let rest = entries
    .filter((entry) => entry.expiresMs > nowMs)
    .sort((a, b) => a.expiresMs - b.expiresMs);
  const rows: ProjectionRow[] = [];
  while (rest.length > 0) {
    const { expiresMs: soonestMs, leadMs } = rest[0];
    const batch = ordersInBatch(rest);
    const fireAt = soonestMs - leadMs;
    if (inHorizon(fireAt, nowMs, horizonMs)) {
      const fire: OrdersLapsingFire = {
        eventId: 'ordersLapsing',
        characterId,
        count: batch,
        soonestMs,
        thresholdMs: leadMs,
      };
      rows.push(
        buildRow(characterId, 'ordersLapsing', fire, fireAt, copy(fire, characterName, {}))
      );
    }
    rest = rest.slice(batch);
  }
  return rows;
}

export function projectCloneJump(
  characterId: number,
  characterName: string,
  entries: readonly CloneJumpEntrySnapshot[],
  copy: PushCopy<CloneJumpReadyFire, Record<string, never>>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const { lastJumpMs, readyAtMs } of entries) {
    if (!inHorizon(readyAtMs, nowMs, horizonMs)) continue;
    const fire: CloneJumpReadyFire = {
      eventId: 'cloneJumpReady',
      characterId,
      lastJumpMs,
      readyAtMs,
    };
    rows.push(
      buildRow(characterId, 'cloneJumpReady', fire, readyAtMs, copy(fire, characterName, {}))
    );
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

export function projectAccelerators(
  characterId: number,
  characterName: string,
  entries: readonly AcceleratorEntrySnapshot[],
  copy: PushCopy<AcceleratorExpiringFire, Record<string, never>>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    const fireAt = entry.expiresAtMs - entry.leadMs;
    if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
    const fire: AcceleratorExpiringFire = {
      eventId: 'acceleratorExpiring',
      characterId,
      expiresAtMs: entry.expiresAtMs,
      bonus: entry.bonus,
      thresholdMs: entry.leadMs,
    };
    rows.push(
      buildRow(characterId, 'acceleratorExpiring', fire, fireAt, copy(fire, characterName, {}))
    );
  }
  return rows;
}

export interface SharedMoonPopProjectionNames {
  readonly corporations: ReadonlyMap<number, string>;
  readonly when: (ms: number) => string;
}

export interface SharedMoonPopProjectionOptions {
  readonly characterId: number;
  readonly characterName: string;
  readonly entries: readonly SharedMoonPopEntrySnapshot[];
  readonly mutedCorporationIds: ReadonlySet<number>;
  readonly names: SharedMoonPopProjectionNames;
  readonly copy: PushCopy<SharedMoonPopFire, { corporation?: string; when?: string }>;
  readonly nowMs: number;
  readonly horizonMs?: number;
}

export function projectSharedMoonPops({
  characterId,
  characterName,
  entries,
  mutedCorporationIds,
  names,
  copy,
  nowMs,
  horizonMs = PROJECTION_HORIZON_MS,
}: SharedMoonPopProjectionOptions): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    if (mutedCorporationIds.has(entry.corporationId)) continue;
    const fireAt = entry.popAtMs - entry.leadMs;
    if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
    const fire = sharedMoonPopFire(characterId, entry);
    const text = copy(fire, characterName, {
      corporation: names.corporations.get(entry.corporationId),
      when: names.when(entry.popAtMs),
    });
    rows.push(buildRow(characterId, 'sharedMoonPop', fire, fireAt, text));
  }
  return rows;
}

export function projectMercenaryDens(
  characterId: number,
  characterName: string,
  entries: readonly DenEntrySnapshot[],
  planetNames: ReadonlyMap<number, string>,
  copy: PushCopy<MercenaryDenReinforcedFire, { planet?: string }>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    const end = entry.reinforcedUntilMs;
    if (end === null) continue;
    const phases = [
      { phase: 'soon' as const, fireAt: end - entry.leadMs },
      { phase: 'out' as const, fireAt: end },
    ];
    for (const { phase, fireAt } of phases) {
      if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
      const fire: MercenaryDenReinforcedFire = {
        eventId: 'mercenaryDenReinforced',
        characterId,
        denId: entry.denId,
        planetId: entry.planetId,
        reinforcedUntilMs: end,
        thresholdMs: entry.leadMs,
        phase,
      };
      const names = { planet: planetNames.get(entry.planetId) };
      rows.push(
        buildRow(
          characterId,
          'mercenaryDenReinforced',
          fire,
          fireAt,
          copy(fire, characterName, names)
        )
      );
    }
  }
  return rows;
}

export function projectSkyhookRaids(
  characterId: number,
  characterName: string,
  entries: readonly SkyhookEntrySnapshot[],
  planetNames: ReadonlyMap<number, string>,
  copy: PushCopy<SkyhookRaidableFire, { planet?: string }>,
  nowMs: number,
  horizonMs: number = PROJECTION_HORIZON_MS
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const entry of entries) {
    const { windowStartMs: start, windowEndMs: end } = entry;
    if (start === null || end === null) continue;
    const phases = [
      { phase: 'soon' as const, fireAt: start - entry.leadMs },
      { phase: openPhase(entry), fireAt: start },
    ];
    for (const { phase, fireAt } of phases) {
      if (!inHorizon(fireAt, nowMs, horizonMs)) continue;
      const fire: SkyhookRaidableFire = {
        eventId: 'skyhookRaidable',
        characterId,
        skyhookId: entry.skyhookId,
        planetId: entry.planetId,
        windowStartMs: start,
        windowEndMs: end,
        thresholdMs: entry.leadMs,
        unsecuredUnits: entry.unsecuredUnits,
        phase,
      };
      const names = { planet: planetNames.get(entry.planetId) };
      rows.push(
        buildRow(characterId, 'skyhookRaidable', fire, fireAt, copy(fire, characterName, names))
      );
    }
  }
  return rows;
}

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
