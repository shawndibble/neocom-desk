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
import { loadCharacterNotifications } from '@/features/character/notifications';
import { loadCalendarEvents as loadCharacterCalendarEvents } from '@/features/character/calendar';
import { loadContracts as loadCharacterContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import {
  loadCorporationId,
  loadCorporationStructures,
  MASTER_WALLET_DIVISION,
} from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { loadCorporationMemberIds } from '@/features/corp/members';
import { loadCorporationWallets, loadCorporationWalletJournal } from '@/features/corp/wallet';
import { loadCharacterRoles, corpWideRoles } from '@/features/corp/roles';
import { corpCapabilities, type CorpCapability } from '@/engine/corpRoles';
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  WalletJournalEntry,
  MarketOrder,
  MarketOrderHistory,
  CharacterNotification,
  CorporationIndustryJob,
} from '@/esi/endpoints';
import {
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  diffPlanetaryExtractorExpiring,
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  diffContractAccepted,
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  diffEveNotification,
  diffStructureFuelLow,
  diffCorpIndustryJobReady,
  diffCorpMemberJoined,
  diffCorpMemberLeft,
  diffCorpWalletThreshold,
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
  type ExtractorExpiringFire,
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
  type EveNotificationEntrySnapshot,
  type EveNotificationSnapshot,
  type EveNotificationFire,
  type StructureFuelEntrySnapshot,
  type StructureFuelSnapshot,
  type StructureFuelLowFire,
  type CorpIndustryJobEntrySnapshot,
  type CorpIndustryJobSnapshot,
  type CorpIndustryJobNotificationFire,
  type CorpRosterMemberSnapshot,
  type CorpRosterSnapshot,
  type CorpMemberJoinedFire,
  type CorpMemberLeftFire,
  type CorpWalletJournalEntrySnapshot,
  type CorpWalletDivisionSnapshot,
  type CorpWalletSnapshot,
  type CorpWalletThresholdFire,
} from '@/engine/notificationDiffs';
import type { NotificationEventId } from './events';
import { useNotificationPreferences, characterEventThresholds } from './preferences';
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
  | ExtractorExpiringFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire
  | EveNotificationFire
  | StructureFuelLowFire
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire;

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
  PlanetaryNotificationFire | ExtractorExpiringFire
>({
  id: 'colonies',
  eventIds: ['planetaryExtractionDone', 'planetaryExtractorExpiring'],
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
  // Both gates are load-bearing now that one snapshot answers for two events:
  // the fetch is skipped only when every event of the domain is off.
  diffs: [
    gatedOn('planetaryExtractionDone', diffPlanetaryExtractionDone),
    gatedOn('planetaryExtractorExpiring', diffPlanetaryExtractorExpiring),
  ],
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

/* -------------------------------------------------------------------------- */
/* EVE's own notifications                                                    */
/* -------------------------------------------------------------------------- */

function isEveNotificationEntrySnapshot(raw: unknown): raw is EveNotificationEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.notificationId === 'number' &&
    typeof r.type === 'string' &&
    typeof r.senderId === 'number' &&
    typeof r.senderType === 'string' &&
    typeof r.text === 'string' &&
    typeof r.timestamp === 'string'
  );
}

/**
 * The ninth domain (issue #274): EVE's own server-pushed notifications, a
 * different, non-overlapping set from every other domain here — those are
 * all synthesized by diffing; this one is fed to the app pre-formed. Single
 * `eveNotification` event covering roughly a hundred underlying `type`
 * strings, filtered individually at delivery time
 * (`foregroundPoller.ts`/`preferences.ts`) rather than modeled as one
 * `NotificationEventId` per type — CCP adds types without notice, so the
 * catalog cannot be a closed enum (esi/esi-issues#1380).
 */
export const eveNotificationDomain = defineDomain<
  CharacterNotification,
  EveNotificationSnapshot,
  EveNotificationFire
>({
  id: 'eveNotification',
  eventIds: ['eveNotification'],
  stateKey: 'notifications.pollerState.eveNotification',
  entriesKey: 'entries',
  isEntry: isEveNotificationEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterNotifications(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (notifications, nowMs) => ({
    entries: notifications.map((n) => ({
      notificationId: n.notification_id,
      type: n.type,
      senderId: n.sender_id,
      senderType: n.sender_type,
      text: n.text ?? '',
      timestamp: n.timestamp,
    })),
    nowMs,
  }),
  diffs: [gatedOn('eveNotification', diffEveNotification)],
});

/* -------------------------------------------------------------------------- */
/* Corp domains (issue #299)                                                  */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/**
 * The corp gate every domain below runs before its own ESI call (AC5): CCP
 * role-gates the corporation endpoints server-side, so a granted scope alone
 * does not mean the Character can read the data (`engine/corpRoles.ts`). Null
 * for "cannot fetch this poll" — corporation unknown, roles unreadable this
 * poll, or the specific role missing — always erring toward *not* calling the
 * endpoint rather than guessing. `loadCharacterRoles` is documented as cheap
 * enough to run for everyone (`features/corp/roles.ts`), and this only runs
 * for a Character whose `enabledEvents` for the domain is already non-empty.
 */
async function corpContextFor(
  characterId: number,
  capability: CorpCapability
): Promise<{ corporationId: number } | null> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return null;
  const rolesResult = await loadCharacterRoles(characterId);
  if (rolesResult.needsReauth || rolesResult.cached === null) return null;
  const capabilities = corpCapabilities(corpWideRoles(rolesResult.cached.data));
  if (!capabilities[capability]) return null;
  return { corporationId };
}

/** This Character's current threshold settings (issue #299), device-local and re-read every poll — the mechanism AC4's "without a reload" relies on. */
async function currentThresholds(characterId: number) {
  await useNotificationPreferences.getState().hydrate();
  return characterEventThresholds(useNotificationPreferences.getState().value, characterId);
}

/* Structure fuel low ------------------------------------------------------- */

function isStructureFuelEntrySnapshot(raw: unknown): raw is StructureFuelEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.structureId === 'number' &&
    typeof r.name === 'string' &&
    (r.fuelExpiresMs === null || typeof r.fuelExpiresMs === 'number') &&
    typeof r.thresholdMs === 'number'
  );
}

export const structureFuelDomain = defineDomain<
  StructureFuelEntrySnapshot,
  StructureFuelSnapshot,
  StructureFuelLowFire
>({
  id: 'structureFuel',
  eventIds: ['structureFuelLow'],
  stateKey: 'notifications.pollerState.structureFuel',
  entriesKey: 'entries',
  isEntry: isStructureFuelEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadStructures');
    if (context === null) return null;
    const result = await loadCorporationStructures(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholds = await currentThresholds(characterId);
    const thresholdMs = thresholds.structureFuelLowDays * DAY_MS;
    // Reuses the board's own ESI-to-engine adaptation (`boardSources.ts`)
    // rather than re-parsing `fuel_expires` here — same underlying data the
    // board already loads, per the ticket brief.
    return toBoardStructures(result.cached.data).map((structure) => ({
      structureId: structure.structureId,
      name: structure.name,
      fuelExpiresMs: structure.fuelExpiresMs,
      thresholdMs,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  diffs: [gatedOn('structureFuelLow', diffStructureFuelLow)],
});

/* Corp industry jobs --------------------------------------------------------- */

function isCorpIndustryJobEntrySnapshot(raw: unknown): raw is CorpIndustryJobEntrySnapshot {
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

function toCorpIndustryJobEntrySnapshot(job: CorporationIndustryJob): CorpIndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const corpIndustryJobDomain = defineDomain<
  CorporationIndustryJob,
  CorpIndustryJobSnapshot,
  CorpIndustryJobNotificationFire
>({
  id: 'corpIndustryJobs',
  eventIds: ['corpIndustryJobReady'],
  stateKey: 'notifications.pollerState.corpIndustryJobs',
  entriesKey: 'entries',
  isEntry: isCorpIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadIndustry');
    if (context === null) return null;
    const result = await loadCorporationIndustryJobs(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toCorpIndustryJobEntrySnapshot), nowMs }),
  diffs: [gatedOn('corpIndustryJobReady', diffCorpIndustryJobReady)],
});

/* Corp roster ----------------------------------------------------------------- */

function isCorpRosterMemberSnapshot(raw: unknown): raw is CorpRosterMemberSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  return typeof (raw as Record<string, unknown>).characterId === 'number';
}

/**
 * `/members`, not `/membertracking` — the diff only needs identity, and the
 * page that needs the richer read (`routes/CorpMembers.tsx`, #333) is a
 * second, independent consumer of the same capability. Both answer to
 * `canReadMembers` (Director-only, `engine/corpRoles.ts`), matching that
 * route's existing gate rather than inventing a narrower one for this poller.
 */
export const corpRosterDomain = defineDomain<
  number,
  CorpRosterSnapshot,
  CorpMemberJoinedFire | CorpMemberLeftFire
>({
  id: 'corpRoster',
  eventIds: ['corpMemberJoined', 'corpMemberLeft'],
  stateKey: 'notifications.pollerState.corpRoster',
  entriesKey: 'entries',
  isEntry: isCorpRosterMemberSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadMembers');
    if (context === null) return null;
    const result = await loadCorporationMemberIds(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (memberIds, nowMs) => ({
    entries: memberIds.map((characterId) => ({ characterId })),
    nowMs,
  }),
  // Both gates are load-bearing (colonyDomain's precedent): the fetch is
  // skipped only when both joined and left are off.
  diffs: [
    gatedOn('corpMemberJoined', diffCorpMemberJoined),
    gatedOn('corpMemberLeft', diffCorpMemberLeft),
  ],
});

/* Corp wallet threshold --------------------------------------------------- */

function isCorpWalletJournalEntrySnapshot(raw: unknown): raw is CorpWalletJournalEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'number' && (r.amount === null || typeof r.amount === 'number');
}

function isCorpWalletDivisionSnapshot(raw: unknown): raw is CorpWalletDivisionSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.division === 'number' &&
    typeof r.balance === 'number' &&
    Array.isArray(r.journal) &&
    r.journal.every(isCorpWalletJournalEntrySnapshot) &&
    typeof r.balanceFloorIsk === 'number' &&
    typeof r.transactionCeilingIsk === 'number'
  );
}

/**
 * Balance-below is checked across every division `/wallets` already returns
 * in one call; transaction-above is checked only on the master division's
 * journal, since ESI publishes no all-divisions journal and the seven are
 * separately paginated and role-gated (CONTEXT.md round 43, `boardData.ts`'s
 * `MASTER_WALLET_DIVISION` reasoning).
 */
export const corpWalletDomain = defineDomain<
  CorpWalletDivisionSnapshot,
  CorpWalletSnapshot,
  CorpWalletThresholdFire
>({
  id: 'corpWallet',
  eventIds: ['corpWalletThreshold'],
  stateKey: 'notifications.pollerState.corpWallet',
  entriesKey: 'divisions',
  isEntry: isCorpWalletDivisionSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadWallet');
    if (context === null) return null;
    const walletsResult = await loadCorporationWallets(characterId, context.corporationId);
    if (walletsResult.needsReauth || walletsResult.cached === null) return null;
    const journalResult = await loadCorporationWalletJournal(
      characterId,
      context.corporationId,
      MASTER_WALLET_DIVISION
    );
    if (journalResult.needsReauth || journalResult.cached === null) return null;
    // A truncated master-division journal could lower the high-water mark
    // `diffCorpWalletThreshold` tracks, re-firing for entries already
    // reported once the next complete poll sees them again (same reasoning
    // as `walletDomain`'s truncation guard above).
    if (journalResult.cached.truncated) return null;
    const journalEntries = journalResult.cached.data;
    const thresholds = await currentThresholds(characterId);
    return walletsResult.cached.data.map((division) => ({
      division: division.division,
      balance: division.balance,
      journal:
        division.division === MASTER_WALLET_DIVISION
          ? journalEntries.map((entry) => ({
              id: entry.id,
              amount: entry.amount ?? null,
            }))
          : [],
      balanceFloorIsk: thresholds.corpWalletBalanceFloorIsk,
      transactionCeilingIsk: thresholds.corpWalletTransactionCeilingIsk,
    }));
  },
  toSnapshot: (divisions, nowMs) => ({ divisions: [...divisions], nowMs }),
  diffs: [gatedOn('corpWalletThreshold', diffCorpWalletThreshold)],
});

/**
 * Every polled domain, in fetch order. One entry here is the whole cost of
 * adding a domain: `foregroundPoller.ts` names none of them.
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
  eveNotificationDomain,
  structureFuelDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
];
