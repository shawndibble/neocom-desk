/**
 * The polled-domain registry (issue #273): one entry per data domain the
 * Notification poller watches — what it fetches, how that becomes a snapshot,
 * which `engine/notificationDiffs.ts` diffs run against it, and where the last
 * snapshot is kept.
 *
 * Before this, every domain was copy-pasted across five places (an event-id
 * const, a `load*` dependency, a `prev*`/`save*` dependency pair, a
 * `createLocalSetting` store plus merge helper, and a branch in the poller's
 * merge loop). Now `foregroundPoller.ts` is one generic loop over
 * `POLL_DOMAINS`, and **adding a domain is one entry in this file**.
 *
 * The engine's diffs stay pure and untouched; only their registration lives
 * here. `defineDomain` is where each entry's types are erased to `unknown`, so
 * the entry literal is fully type-checked while the loop that drives all of
 * them needs no per-domain branch.
 */
import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { extractorProgramsFromPins } from '@/features/pi/adapters';
import { loadMailHeaders } from '@/features/character/mail';
import { loadCalendarEvents as loadCharacterCalendarEvents } from '@/features/character/calendar';
import { loadContracts as loadCharacterContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  WalletJournalEntry,
  MarketOrder,
  MarketOrderHistory,
} from '@/esi/endpoints';
import {
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
  type NotificationFire,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type SkillQueueNotificationEventId,
  type IndustryJobSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobNotificationFire,
  type ColonyExtractorSnapshot,
  type ColonySnapshotEntry,
  type PlanetarySnapshot,
  type PlanetaryNotificationFire,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type MailNotificationFire,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
  type NewCalendarEventFire,
  type CalendarEventStartingFire,
  type ContractEntrySnapshot,
  type ContractSnapshot,
  type ContractStatus,
  type ContractNotificationFire,
  type WalletJournalEntrySnapshot,
  type WalletSnapshot,
  type WalletNotificationFire,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type MarketOrderNotificationFire,
} from '@/engine/notificationDiffs';
import type { NotificationEventId } from './events';
import { createPollerStateStore, isSnapshotWith, type PollerState } from './pollerState';
import type { LocalSettingStore } from '@/lib/useLocalSetting';

/** Every fire any registered diff can produce. */
export type AnyNotificationFire =
  | NotificationFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire;

/**
 * The one diff signature every domain speaks. Most engine diffs don't take an
 * enabled set — `gatedOn` adapts those. Calendar is the domain that needs the
 * parameter: two diffs read one snapshot and each answers for its own event.
 */
export type DomainDiff<TSnapshot, TFire> = (
  characterId: number,
  prev: TSnapshot | undefined,
  next: TSnapshot,
  enabledEvents: ReadonlySet<NotificationEventId>
) => TFire[];

/**
 * Adapts an engine diff that knows nothing about toggles to `DomainDiff`: it
 * runs only when its own event is enabled for this character. Redundant for a
 * single-event domain (the fetch is already skipped when its only event is
 * off) and load-bearing for calendar's two.
 */
export function gatedOn<TSnapshot, TFire>(
  eventId: NotificationEventId,
  diff: (characterId: number, prev: TSnapshot | undefined, next: TSnapshot) => TFire[]
): DomainDiff<TSnapshot, TFire> {
  return (characterId, prev, next, enabledEvents) =>
    enabledEvents.has(eventId) ? diff(characterId, prev, next) : [];
}

/** One registry entry, as written. Fully typed; `defineDomain` erases it. */
interface PollDomainSpec<TRaw, TSnapshot, TFire extends AnyNotificationFire> {
  /** Stable identifier, used for the state key and by tests to address a domain. */
  readonly id: string;
  /** Every Notification Event this domain's snapshot can fire. */
  readonly eventIds: readonly NotificationEventId[];
  /** Dexie `settings` key holding this domain's last snapshot per character. */
  readonly stateKey: string;
  /** Name of the snapshot's array field — `entries` for all but planetary. */
  readonly entriesKey: string;
  /** Guard for one element of that array, so a stale stored shape is discarded. */
  readonly isEntry: (raw: unknown) => boolean;
  /** Fetches this domain for one character, or null to skip it this poll. */
  readonly load: (characterId: number) => Promise<TRaw[] | null>;
  /** Turns what `load` returned into the snapshot the engine diffs compare. */
  readonly toSnapshot: (raw: readonly TRaw[], nowMs: number) => TSnapshot;
  /** Run in order against the snapshot; a domain may register more than one. */
  readonly diffs: readonly DomainDiff<TSnapshot, TFire>[];
}

/**
 * A registry entry as the poll loop sees it: the same entry with its snapshot
 * and row types erased, which is what lets one loop drive every domain.
 */
export interface PollDomain {
  readonly id: string;
  readonly eventIds: readonly NotificationEventId[];
  readonly stateKey: string;
  readonly store: LocalSettingStore<PollerState<unknown>>;
  readonly load: (characterId: number) => Promise<readonly unknown[] | null>;
  readonly toSnapshot: (raw: readonly unknown[], nowMs: number) => unknown;
  /** Every registered diff, in order, each already gated on its own event. */
  readonly diff: (
    characterId: number,
    prev: unknown,
    next: unknown,
    enabledEvents: ReadonlySet<NotificationEventId>
  ) => AnyNotificationFire[];
}

/**
 * The single erasure point. Inside this function a domain's `TSnapshot` is
 * known and every cast is checked against the spec above; outside it, nothing
 * needs to know which domain it is holding.
 */
function defineDomain<TRaw, TSnapshot, TFire extends AnyNotificationFire>(
  spec: PollDomainSpec<TRaw, TSnapshot, TFire>
): PollDomain {
  const store = createPollerStateStore<TSnapshot>(
    spec.stateKey,
    isSnapshotWith<TSnapshot>(spec.entriesKey, spec.isEntry)
  );
  return {
    id: spec.id,
    eventIds: spec.eventIds,
    stateKey: spec.stateKey,
    store: store as unknown as LocalSettingStore<PollerState<unknown>>,
    load: spec.load,
    toSnapshot: (raw, nowMs) => spec.toSnapshot(raw as readonly TRaw[], nowMs),
    diff: (characterId, prev, next, enabledEvents) => {
      const fires: AnyNotificationFire[] = [];
      for (const diff of spec.diffs) {
        fires.push(
          ...diff(characterId, prev as TSnapshot | undefined, next as TSnapshot, enabledEvents)
        );
      }
      return fires;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Skill queue                                                                 */
/* -------------------------------------------------------------------------- */

/** `SKILL_QUEUE_NOTIFICATION_DIFFS` is the one source of which skill-queue-driven events this poller runs; every other domain lists its events directly (engine/notificationDiffs.ts). */
const SKILL_QUEUE_EVENT_IDS = Object.keys(
  SKILL_QUEUE_NOTIFICATION_DIFFS
) as SkillQueueNotificationEventId[];

function isSkillQueueEntrySnapshot(raw: unknown): raw is SkillQueueEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.skillId === 'number' &&
    typeof r.finishedLevel === 'number' &&
    typeof r.queuePosition === 'number' &&
    (r.finishMs === null || typeof r.finishMs === 'number')
  );
}

function toSkillQueueEntrySnapshot(entry: SkillQueueEntry): SkillQueueEntrySnapshot {
  const finishMs = entry.finish_date ? Date.parse(entry.finish_date) : NaN;
  return {
    skillId: entry.skill_id,
    finishedLevel: entry.finished_level,
    queuePosition: entry.queue_position,
    finishMs: Number.isFinite(finishMs) ? finishMs : null,
  };
}

export const skillQueueDomain = defineDomain<SkillQueueEntry, SkillQueueSnapshot, NotificationFire>(
  {
    id: 'skillQueue',
    eventIds: SKILL_QUEUE_EVENT_IDS,
    stateKey: 'notifications.pollerState.skillQueue',
    entriesKey: 'entries',
    isEntry: isSkillQueueEntrySnapshot,
    load: async (characterId) => {
      const result = await loadCharacterSkillQueueWithStatus(characterId);
      if (result.needsReauth || result.cached === null) return null;
      return result.cached.data;
    },
    toSnapshot: (entries, nowMs) => ({ entries: entries.map(toSkillQueueEntrySnapshot), nowMs }),
    // The engine already runs this domain's diffs off an enabled set, so it is
    // the one that needs no `gatedOn` adapter — only the narrowing back to the
    // ids it knows about.
    diffs: [
      (characterId, prev, next, enabledEvents) =>
        runSkillQueueNotificationDiffs(
          characterId,
          prev,
          next,
          new Set(SKILL_QUEUE_EVENT_IDS.filter((eventId) => enabledEvents.has(eventId)))
        ),
    ],
  }
);

/* -------------------------------------------------------------------------- */
/* Industry jobs                                                               */
/* -------------------------------------------------------------------------- */

function isIndustryJobEntrySnapshot(raw: unknown): raw is IndustryJobEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.jobId === 'number' &&
    typeof r.endMs === 'number' &&
    typeof r.blueprintTypeId === 'number' &&
    (r.productTypeId === null || typeof r.productTypeId === 'number') &&
    typeof r.activityId === 'number'
  );
}

function toIndustryJobEntrySnapshot(job: IndustryJob): IndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const industryJobDomain = defineDomain<
  IndustryJob,
  IndustryJobSnapshot,
  IndustryJobNotificationFire
>({
  id: 'industryJobs',
  eventIds: ['industryJobComplete'],
  stateKey: 'notifications.pollerState.industryJobs',
  entriesKey: 'entries',
  isEntry: isIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterIndustryJobs(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toIndustryJobEntrySnapshot), nowMs }),
  diffs: [gatedOn('industryJobComplete', diffIndustryJobComplete)],
});

/* -------------------------------------------------------------------------- */
/* Planetary colonies                                                          */
/* -------------------------------------------------------------------------- */

function isExtractorSnapshot(raw: unknown): raw is ColonyExtractorSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.pinId === 'number' && typeof r.expiryTimeMs === 'number';
}

function isColonySnapshotEntry(raw: unknown): raw is ColonySnapshotEntry {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.planetId === 'number' &&
    Array.isArray(r.extractors) &&
    r.extractors.every(isExtractorSnapshot)
  );
}

export const colonyDomain = defineDomain<
  ColonySnapshotEntry,
  PlanetarySnapshot,
  PlanetaryNotificationFire
>({
  id: 'colonies',
  eventIds: ['planetaryExtractionDone'],
  stateKey: 'notifications.pollerState.colonies',
  entriesKey: 'colonies',
  isEntry: isColonySnapshotEntry,
  load: async (characterId) => {
    const planetsResult = await loadCharacterPlanets(characterId);
    if (planetsResult.needsReauth || planetsResult.cached === null) return null;
    const planets = planetsResult.cached.data;
    const details = await loadAllColonyDetails(
      characterId,
      planets.map((p) => p.planet_id)
    );
    const colonies: ColonySnapshotEntry[] = [];
    for (const planet of planets) {
      const detail = details.get(planet.planet_id);
      if (!detail || detail.needsReauth || detail.cached === null) continue;
      const programs = extractorProgramsFromPins(detail.cached.data.pins);
      colonies.push({
        planetId: planet.planet_id,
        extractors: programs.map((p) => ({ pinId: p.pinId, expiryTimeMs: p.expiryTimeMs })),
      });
    }
    return colonies;
  },
  toSnapshot: (colonies, nowMs) => ({ colonies: [...colonies], nowMs }),
  diffs: [gatedOn('planetaryExtractionDone', diffPlanetaryExtractionDone)],
});

/* -------------------------------------------------------------------------- */
/* Mail                                                                        */
/* -------------------------------------------------------------------------- */

function isMailHeaderSnapshot(raw: unknown): raw is MailHeaderSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.mailId === 'number';
}

export const mailDomain = defineDomain<MailHeader, MailSnapshot, MailNotificationFire>({
  id: 'mail',
  eventIds: ['newMail'],
  stateKey: 'notifications.pollerState.mail',
  entriesKey: 'entries',
  isEntry: isMailHeaderSnapshot,
  load: async (characterId) => {
    const result = await loadMailHeaders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (headers, nowMs) => ({
    entries: headers.map((header) => ({ mailId: header.mail_id })),
    nowMs,
  }),
  diffs: [gatedOn('newMail', diffNewMail)],
});

/* -------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* -------------------------------------------------------------------------- */

function isCalendarEventEntrySnapshot(raw: unknown): raw is CalendarEventEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.calendarEventId === 'number' && typeof r.startMs === 'number';
}

export const calendarDomain = defineDomain<
  CalendarEventSummary,
  CalendarSnapshot,
  NewCalendarEventFire | CalendarEventStartingFire
>({
  id: 'calendar',
  eventIds: ['newCalendarEvent', 'calendarEventStarting'],
  stateKey: 'notifications.pollerState.calendar',
  entriesKey: 'entries',
  isEntry: isCalendarEventEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterCalendarEvents(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (events, nowMs) => ({
    entries: events.map((event) => ({
      calendarEventId: event.event_id,
      startMs: Date.parse(event.event_date),
    })),
    nowMs,
  }),
  // The one domain running two diffs off a single snapshot and a single fetch:
  // each is gated on its own event so switching one off leaves the other alone.
  diffs: [
    gatedOn('newCalendarEvent', diffNewCalendarEvent),
    gatedOn('calendarEventStarting', diffCalendarEventStarting),
  ],
});

/* -------------------------------------------------------------------------- */
/* Contracts                                                                   */
/* -------------------------------------------------------------------------- */

const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'outstanding',
  'in_progress',
  'finished_issuer',
  'finished_contractor',
  'finished',
  'cancelled',
  'rejected',
  'failed',
  'deleted',
  'reversed',
];

function isContractStatus(raw: unknown): raw is ContractStatus {
  return typeof raw === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(raw);
}

function isContractEntrySnapshot(raw: unknown): raw is ContractEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.contractId === 'number' && isContractStatus(r.status);
}

export const contractDomain = defineDomain<Contract, ContractSnapshot, ContractNotificationFire>({
  id: 'contracts',
  eventIds: ['contractAccepted'],
  stateKey: 'notifications.pollerState.contracts',
  entriesKey: 'entries',
  isEntry: isContractEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterContracts(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set would persist a short ContractSnapshot missing
    // contracts already in_progress; the next complete poll would then see
    // them as newly appearing and false-fire contractAccepted (issue #174
    // review) — skip this poll entirely rather than save a partial baseline.
    if (result.cached.truncated) return null;
    return result.cached.data;
  },
  toSnapshot: (contracts, nowMs) => ({
    entries: contracts.map((contract) => ({
      contractId: contract.contract_id,
      status: contract.status,
    })),
    nowMs,
  }),
  diffs: [gatedOn('contractAccepted', diffContractAccepted)],
});

/* -------------------------------------------------------------------------- */
/* Wallet                                                                      */
/* -------------------------------------------------------------------------- */

function isWalletJournalEntrySnapshot(raw: unknown): raw is WalletJournalEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'number' && (r.amount === null || typeof r.amount === 'number');
}

export const walletDomain = defineDomain<
  WalletJournalEntry,
  WalletSnapshot,
  WalletNotificationFire
>({
  id: 'wallet',
  eventIds: ['walletBalanceChanged'],
  stateKey: 'notifications.pollerState.wallet',
  entriesKey: 'entries',
  isEntry: isWalletJournalEntrySnapshot,
  load: async (characterId) => {
    const result = await loadWalletJournalWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set could lower the high-water mark diffWalletBalanceChanged
    // tracks, re-firing for entries already reported once the next complete poll
    // sees them again (same reasoning as the contracts truncation guard above).
    if (result.cached.truncated) return null;
    return result.cached.data;
  },
  toSnapshot: (entries, nowMs) => ({
    entries: entries.map((entry) => ({ id: entry.id, amount: entry.amount ?? null })),
    nowMs,
  }),
  diffs: [gatedOn('walletBalanceChanged', diffWalletBalanceChanged)],
});

/* -------------------------------------------------------------------------- */
/* Market orders                                                               */
/* -------------------------------------------------------------------------- */

function isMarketOrderEntrySnapshot(raw: unknown): raw is MarketOrderEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.orderId === 'number' && typeof r.filled === 'boolean';
}

/**
 * Merges open orders with order history into the engine's `filled` shape.
 * ESI's history `state` enum ('cancelled' | 'expired') has no distinct
 * "filled" value, so filled-ness is derived here, at the ESI/engine boundary
 * (ARCHITECTURE.md): an order still open is never filled; an order gone from
 * the open list and present in history is filled once `volume_remain` is 0.
 */
export function deriveMarketOrderEntries(
  openOrders: readonly MarketOrder[],
  history: readonly MarketOrderHistory[]
): MarketOrderEntrySnapshot[] {
  const openIds = new Set(openOrders.map((order) => order.order_id));
  const entries: MarketOrderEntrySnapshot[] = openOrders.map((order) => ({
    orderId: order.order_id,
    filled: false,
  }));
  for (const order of history) {
    if (openIds.has(order.order_id)) continue;
    entries.push({ orderId: order.order_id, filled: order.volume_remain === 0 });
  }
  return entries;
}

export const marketOrderDomain = defineDomain<
  MarketOrderEntrySnapshot,
  MarketOrderSnapshot,
  MarketOrderNotificationFire
>({
  id: 'marketOrders',
  eventIds: ['marketOrderFilled'],
  stateKey: 'notifications.pollerState.marketOrders',
  entriesKey: 'entries',
  isEntry: isMarketOrderEntrySnapshot,
  load: async (characterId) => {
    const [openResult, historyResult] = await Promise.all([
      loadOrders(characterId),
      loadOrderHistory(characterId),
    ]);
    if (openResult.needsReauth || openResult.cached === null) return null;
    if (historyResult.needsReauth || historyResult.cached === null) return null;
    // A truncated history page set would misreport a still-open order as
    // filled-and-gone; skip this poll entirely rather than save a partial
    // baseline (same reasoning as the contracts truncation guard above).
    if (historyResult.cached.truncated) return null;
    return deriveMarketOrderEntries(openResult.cached.data, historyResult.cached.data);
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  diffs: [gatedOn('marketOrderFilled', diffMarketOrderFilled)],
});

/**
 * Every polled domain, in fetch order. One entry here is the whole cost of
 * adding a ninth: `foregroundPoller.ts` names no domain at all.
 */
export const POLL_DOMAINS: readonly PollDomain[] = [
  skillQueueDomain,
  industryJobDomain,
  colonyDomain,
  mailDomain,
  calendarDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
];
