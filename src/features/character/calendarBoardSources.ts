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
 * compares false against every severity threshold, so it must not reach the
 * engine at all; and a character clock with no instant is not a countdown —
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
import type { BoardCalendarEventSource, BoardClockSource } from '@/engine/character/board';

/**
 * `Date.parse` of an absent or unparseable ESI timestamp, as `null` rather
 * than `NaN` — see the module note above for why that distinction is
 * load-bearing.
 */
function parseInstant(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

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
 * week", which is this page's question. Volume is handled where it belongs —
 * the route's horizon window drops the far-future tail, and the kind filter
 * turns the whole source off for someone who does not want it.
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

/** Jobs still running or finished-but-undelivered. A delivered job has no clock left. */
const LIVE_JOB_STATUSES = new Set<IndustryJob['status']>(['active', 'ready']);

export function toIndustryJobSources(
  jobs: readonly IndustryJob[],
  typeName: TypeNamer
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
      detail: job.status,
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

export function toContractExpirySources(contracts: readonly Contract[]): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const contract of contracts) {
    if (!isActiveContractStatus(contract.status)) continue;
    const deadlineMs = parseInstant(contract.date_expired);
    if (deadlineMs === null) continue;
    sources.push({
      id: String(contract.contract_id),
      // Most contracts are untitled, and then the type is the only name there
      // is. Not translated here: `detail` and `subject` are data, and the view
      // owns the wording.
      subject: contract.title || contract.type,
      detail: contract.type,
      deadlineMs,
    });
  }
  return sources;
}

const ORDER_DURATION_DAY_MS = 86_400_000;

/**
 * The board's one genuinely derived deadline.
 *
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
      deadlineMs: issuedMs + order.duration * ORDER_DURATION_DAY_MS,
    });
  }
  return sources;
}
