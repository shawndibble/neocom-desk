/**
 * ESI shapes in, `engine/character/board.ts` sources out.
 *
 * The engine ranks clocks; it does not know what an ESI industry job looks
 * like, parse a date, or resolve a type name. This module does all three, and
 * is the only place that knows a market order has no expiry field at all.
 *
 * Pure itself — no fetch, no Dexie. The loaders live in
 * `calendarBoardData.ts`, the same split `features/corp/boardSources.ts` and
 * `features/corp/boardData.ts` already use.
 *
 * Every converter **drops** a row it cannot give a real instant to, rather than
 * passing a `NaN` or a `null` deadline down. A `NaN` sorts unpredictably and
 * buckets onto no day at all, so it must not reach the engine; and a character
 * clock with no instant is not a countdown —
 * a paused skill queue is a standing fault the notification system already
 * reports, not a row with nothing to sort on.
 */

import type {
  CalendarEventSummary,
  Contract,
  IndustryJob,
  MarketOrder,
  PlanetPin,
  SkillQueueEntry,
} from '@/esi/endpoints';
import { isActiveContractStatus } from '@/engine/contractStatus';
import { courierDeliveryDeadlineMs } from '@/engine/courierDeadline';
import { parseInstant } from '@/engine/esiInstant';
import type { BoardCalendarEventSource, BoardClockSource } from '@/engine/character/board';
import type { BoardExtractionSource } from '@/engine/corp/board';
import { stepKey, type SkillPlanSchedule } from '@/engine/skillPlanSchedule';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

const DAY_MS = 86_400_000;

/** Resolves a type id to its SDE name; supplied by the caller, which owns the catalog. */
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
      // ESI documents `importance` as an integer and uses it as a flag. Any
      // non-zero value is "important"; reading it as a scale would invent a
      // hierarchy the API does not promise.
      important: event.importance > 0,
    });
  }
  return sources;
}

/**
 * Every queue entry that has a clock, not just the head.
 *
 * The head answers "what am I training"; the rest answer "what lands this
 * week", which is this page's question. Volume is handled by the rail's day
 * grouping and by the kind filter, which turns the whole source off for
 * someone who does not want it.
 */
export function toSkillTrainingSources(
  queue: readonly SkillQueueEntry[],
  typeName: TypeNamer
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const entry of queue) {
    const deadlineMs = parseInstant(entry.finish_date);
    if (deadlineMs === null) continue;
    const level = ROMAN[entry.finished_level - 1] ?? String(entry.finished_level);
    sources.push({
      // `queue_position`, not `skill_id`: one skill appears once per level.
      id: String(entry.queue_position),
      subject: `${typeName(entry.skill_id)} ${level}`,
      detail: '',
      deadlineMs,
    });
  }
  return sources;
}

/**
 * Every step the plan still has to train, dated where the schedule says it
 * lands. A forecast, not an ESI clock — `isProjectedKind` is what tells the
 * surfaces to say so.
 *
 * A step the live queue already carries is dropped: the queue row is the
 * real clock and wins. `projectQueueEnd` leaves every queued level from the
 * first one the plan lists onward to the plan, so shared levels land here.
 */
export function toSkillPlanSources(
  schedule: Pick<SkillPlanSchedule, 'scheduled' | 'startDate'>,
  queue: readonly SkillQueueEntry[],
  typeName: TypeNamer
): BoardClockSource[] {
  const queued = new Set(queue.map((entry) => `${entry.skill_id}:${entry.finished_level}`));
  const startMs = schedule.startDate.getTime();
  const sources: BoardClockSource[] = [];
  for (const step of schedule.scheduled) {
    const id = stepKey(step);
    if (queued.has(id)) continue;
    const level = ROMAN[step.level - 1] ?? String(step.level);
    sources.push({
      id,
      subject: `${typeName(step.skillTypeID)} ${level}`,
      detail: '',
      deadlineMs: startMs + step.cumulativeSeconds * 1000,
    });
  }
  return sources;
}

/** Jobs still running or finished-but-undelivered. A delivered job has no clock left. */
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
      // The product is what the pilot is waiting for; a job with none (a copy,
      // an invention) is only nameable by its blueprint.
      subject: typeName(job.product_type_id ?? job.blueprint_type_id),
      // A finished job's headline already reads "ready to deliver"
      // (`pastDeadlineLabelKey`); repeating it here would only double the same
      // words on one row. Keyed on the deadline itself, not `job.status` — ESI
      // can still report `active` for a moment after `end_date` passes, and
      // that must not leave the headline and this line disagreeing.
      detail: deadlineMs <= nowMs ? '' : job.status,
      deadlineMs,
    });
  }
  return sources;
}

/** One colony's pins, already paired with the planet's own name by the loader. */
export interface ColonyPins {
  planetName: string;
  pins: readonly PlanetPin[];
}

/**
 * One row per running extractor program.
 *
 * `expiry_time` is the one PI field that does not drift — it is fixed at
 * install and does not need the colony opened in-client to stay true, which is
 * exactly why it is the only one this board reads.
 */
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

/**
 * One row per moon drill: the chunk's arrival while it is still coming, its
 * natural decay once it has landed — the same rule the corp ops board applies
 * (`engine/corp/board.ts`), so the two boards never disagree about a chunk.
 * Which of the two it is rides in `detail` (`arrival` / `decay`); the view
 * owns the wording.
 */
export function toMoonChunkSources(
  extractions: readonly BoardExtractionSource[],
  nowMs: number
): BoardClockSource[] {
  return extractions.map((extraction) => {
    const arrived = nowMs >= extraction.chunkArrivalMs;
    return {
      id: String(extraction.structureId),
      subject: extraction.subject,
      detail: arrived ? 'decay' : 'arrival',
      deadlineMs: arrived ? extraction.naturalDecayMs : extraction.chunkArrivalMs,
    };
  });
}

/**
 * `typeLabel` and `routeName` are supplied by the caller, which alone has
 * i18next and the location-name cache this needs — this module stays pure.
 * `typeLabel` names a contract's type (e.g. "Courier"); `routeName` names an
 * untitled courier's start → end when both ends have resolved (same resolver
 * `ContractIdentity` uses per-row, issue #1706), and `undefined` otherwise.
 */
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
      // Most contracts are untitled. An untitled courier gets its route; every
      // other untitled contract gets its translated type label rather than the
      // raw ESI enum (issue #1715).
      subject: contract.title || routeName(contract) || typeLabel(contract.type),
      detail: contract.type,
      deadlineMs,
    });
  }
  return sources;
}

/**
 * ESI gives `issued` and a `duration` in whole days and never an absolute
 * expiry, so this is arithmetic rather than a field read — and getting it
 * wrong would be invisible, putting the row somewhere plausible but incorrect
 * in an otherwise sensible list. `calendarBoardSources.test.ts` pins it.
 */
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
