import { romanLevel } from '@/engine/projection';
import { isReinforced, openOperations, type Den } from '@/engine/character/mercenaryDens';
import type {
  CalendarEventSummary,
  Contract,
  IndustryJob,
  MarketOrder,
  PlanetPin,
  SkillQueueEntry,
} from '@/esi/endpoints';
import { isActiveContractStatus } from '@/engine/contracts/contractStatus';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { parseInstant } from '@/engine/esiInstant';
import { raidState } from '@/engine/corp/sovereignty';
import type { BoardCalendarEventSource, BoardClockSource } from '@/engine/character/board';
import type { BoardExtractionSource } from '@/engine/corp/board';
import { DAY_MS } from '@/lib/age';
import type { CharacterAcceleratorRecord } from '@/db';
import { isAcceleratorLive } from '@/engine/accelerator';

export type TypeNamer = (typeId: number) => string;

export function toCalendarEventSources(
  events: readonly CalendarEventSummary[]
): BoardCalendarEventSource[] {
  const sources: BoardCalendarEventSource[] = [];
  for (const event of events) {
    const deadlineMs = parseInstant(event.event_date);
    if (deadlineMs === null) continue;
    sources.push({
      id: String(event.event_id),
      subject: event.title,
      detail: '',
      deadlineMs,
      response: event.event_response,
      important: event.importance > 0,
    });
  }
  return sources;
}

export function toSkillTrainingSources(
  queue: readonly SkillQueueEntry[],
  typeName: TypeNamer
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const entry of queue) {
    const deadlineMs = parseInstant(entry.finish_date);
    if (deadlineMs === null) continue;
    const level = romanLevel(entry.finished_level);
    sources.push({
      id: String(entry.queue_position),
      subject: `${typeName(entry.skill_id)} ${level}`,
      detail: '',
      deadlineMs,
    });
  }
  return sources;
}

const LIVE_JOB_STATUSES = new Set<IndustryJob['status']>(['active', 'ready']);

export function toIndustryJobSources(
  jobs: readonly IndustryJob[],
  typeName: TypeNamer,
  nowMs: number
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const job of jobs) {
    if (!LIVE_JOB_STATUSES.has(job.status)) continue;
    const deadlineMs = parseInstant(job.end_date);
    if (deadlineMs === null) continue;
    sources.push({
      id: String(job.job_id),
      subject: typeName(job.product_type_id ?? job.blueprint_type_id),
      detail: deadlineMs <= nowMs ? '' : job.status,
      deadlineMs,
    });
  }
  return sources;
}

export interface ColonyPins {
  planetName: string;
  pins: readonly PlanetPin[];
}

export function toPlanetExtractionSources(colonies: readonly ColonyPins[]): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const colony of colonies) {
    for (const pin of colony.pins) {
      if (!pin.extractor_details) continue;
      const deadlineMs = parseInstant(pin.expiry_time);
      if (deadlineMs === null) continue;
      sources.push({
        id: String(pin.pin_id),
        subject: colony.planetName,
        detail: '',
        deadlineMs,
      });
    }
  }
  return sources;
}

export function toMoonChunkSources(
  extractions: readonly BoardExtractionSource[],
  nowMs: number
): BoardClockSource[] {
  return extractions
    .filter((extraction) => nowMs < extraction.naturalDecayMs)
    .map((extraction) => {
      const arrived = nowMs >= extraction.chunkArrivalMs;
      return {
        id: String(extraction.structureId),
        subject: extraction.subject,
        detail: arrived ? 'decay' : 'arrival',
        deadlineMs: arrived ? extraction.naturalDecayMs : extraction.chunkArrivalMs,
      };
    });
}

export interface SkyhookRaid {
  id: number;
  subject: string;
  systemId: number | null;
  systemName: string | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  unsecuredUnits: number | null;
  securedUnits: number | null;
}

export function toSkyhookRaidSources(
  raids: readonly SkyhookRaid[],
  nowMs: number
): BoardClockSource[] {
  return raids.flatMap((raid) => {
    if (raid.windowStartMs === null || raid.windowEndMs === null) return [];
    const window = { startMs: raid.windowStartMs, endMs: raid.windowEndMs };
    const state = raidState(window, nowMs);
    if (state === 'closed') return [];
    return [
      {
        id: String(raid.id),
        subject: raid.subject,
        detail: state === 'upcoming' ? 'upcoming' : 'open',
        deadlineMs: state === 'upcoming' ? window.startMs : window.endMs,
      },
    ];
  });
}

export type DenClockInput = Den & { planetId: number; planetName: string | null };

export function toMercenaryDenSources(
  dens: readonly DenClockInput[],
  nowMs: number
): BoardClockSource[] {
  return dens.flatMap((den) => {
    const subject = den.planetName ?? `#${den.planetId}`;
    const sources: BoardClockSource[] = [];
    if (isReinforced(den, nowMs)) {
      sources.push({
        id: `${den.id}:reinforcement`,
        subject,
        detail: 'reinforcement',
        deadlineMs: den.reinforcedUntilMs!,
      });
    }
    openOperations(den.operations, nowMs).forEach((op, index) => {
      sources.push({
        id: `${den.id}:operation:${index}`,
        subject,
        detail: 'operation',
        deadlineMs: op.expiresMs,
      });
    });
    return sources;
  });
}

export function toContractExpirySources(
  contracts: readonly Contract[],
  typeLabel: (type: Contract['type']) => string,
  routeName: (contract: Contract) => string | undefined
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const contract of contracts) {
    if (!isActiveContractStatus(contract.status)) continue;
    const deadlineMs = courierDeliveryDeadlineMs(contract) ?? parseInstant(contract.date_expired);
    if (deadlineMs === null) continue;
    sources.push({
      id: String(contract.contract_id),
      subject: contract.title || routeName(contract) || typeLabel(contract.type),
      detail: contract.type,
      deadlineMs,
    });
  }
  return sources;
}

export function toAcceleratorSources(
  record: Pick<CharacterAcceleratorRecord, 'characterId' | 'bonus' | 'expiresAt'> | undefined,
  nowMs: number,
  subjectFor: (bonus: number) => string
): BoardClockSource[] {
  if (!record || !isAcceleratorLive(record, nowMs)) return [];
  return [
    {
      id: String(record.characterId),
      subject: subjectFor(record.bonus),
      detail: '',
      deadlineMs: record.expiresAt,
    },
  ];
}

export function toOrderExpirySources(
  orders: readonly MarketOrder[],
  typeName: TypeNamer
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const order of orders) {
    const issuedMs = parseInstant(order.issued);
    if (issuedMs === null) continue;
    sources.push({
      id: String(order.order_id),
      subject: typeName(order.type_id),
      detail: order.is_buy_order ? 'buy' : 'sell',
      deadlineMs: issuedMs + order.duration * DAY_MS,
    });
  }
  return sources;
}
