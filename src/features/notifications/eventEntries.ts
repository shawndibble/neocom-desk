/**
 * The Event Entry catalog (issue #1285): one entry per Notification Event,
 * and the one place that event's behaviour is declared —
 *
 * - `source` — which poll domain's snapshot it reads (`pollDomains.ts` owns
 *   the fetching; several events can share one fetch),
 * - `diff` — the pure engine diff that fires it (`engine/notificationDiffs.ts`),
 * - `copy` — its live wording and click subject (`domainCopy.ts`),
 * - `projection` — its Scheduled Push renderer, or `null` when it is only
 *   observable by polling (ADR 0010),
 * - `thresholds` — the per-Character threshold fields it owns
 *   (`eventThresholds.ts`), or `null`,
 * - `rowHintKey` — a delivery caveat Settings shows under its row, or `null`.
 *
 * Every field is required, and the catalog is keyed by `NotificationEventId`
 * (itself derived from `events.ts`'s catalog), so a new event that lacks any
 * part of this is a type error here rather than a silent gap. `projection` is
 * further tied to `engine/projection.ts`'s `PROJECTABLE_EVENT_IDS` per key:
 * a projectable event must declare one and any other must say `null`.
 *
 * What reads it: `pollDomains.ts` derives each domain's event list, diffs,
 * renderer and push copy from the entries naming it as their `source`;
 * `NotificationsPanel.tsx` and `notificationRows.ts` derive an event's
 * threshold controls, row hint and Scheduled Push badge from it. The
 * helpers it composes stay where they were — this module declares, it does
 * not implement.
 *
 * Deliberately not reachable from the service worker: `sw.ts` reaches
 * `events.ts`, `preferences.ts` and `eventSelection.ts`, none of which import
 * this, so the SW bundle carries no diff or copy code. Keep it that way — no
 * React, DOM, Dexie or fetch here either.
 */
import {
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffSpExtractionReady,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  diffPlanetaryExtractorExpiring,
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  diffContractAccepted,
  diffContractCompleted,
  diffContractFailed,
  diffCourierDeliveryDue,
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  diffMarketOrderUndercut,
  diffEveNotification,
  diffStructureFuelLow,
  diffCorpIndustryJobReady,
  diffCorpMemberJoined,
  diffCorpMemberLeft,
  diffCorpWalletThreshold,
  diffPriceAlertTriggered,
  type NotificationFire,
  type SpExtractionFire,
  type IndustryJobNotificationFire,
  type PlanetaryNotificationFire,
  type ExtractorExpiringFire,
  type MailNotificationFire,
  type NewCalendarEventFire,
  type CalendarEventStartingFire,
  type ContractNotificationFire,
  type WalletNotificationFire,
  type MarketOrderNotificationFire,
  type MarketOrderUndercutFire,
  type EveNotificationFire,
  type StructureFuelLowFire,
  type CorpIndustryJobNotificationFire,
  type CorpMemberJoinedFire,
  type CorpMemberLeftFire,
  type CorpWalletThresholdFire,
  type PriceAlertTriggeredFire,
  type SkillQueueSnapshot,
  type SpExtractionSnapshot,
  type IndustryJobSnapshot,
  type PlanetarySnapshot,
  type MailSnapshot,
  type CalendarSnapshot,
  type ContractSnapshot,
  type WalletSnapshot,
  type MarketOrderSnapshot,
  type OrderUndercutSnapshot,
  type EveNotificationSnapshot,
  type StructureFuelSnapshot,
  type CorpIndustryJobSnapshot,
  type CorpRosterSnapshot,
  type CorpWalletSnapshot,
  type PriceAlertSnapshot,
} from '@/engine/notificationDiffs';
import type { NotificationCopy } from '@/engine/notificationWording';
import type { ProjectableEventId, PushCopy } from '@/engine/projection';
import {
  skillQueueCopy,
  spExtractionCopy,
  industryJobCopy,
  colonyCopy,
  mailCopy,
  calendarCopy,
  contractCopy,
  walletCopy,
  marketOrderCopy,
  marketOrderUndercutCopy,
  eveNotificationCopy,
  structureFuelCopy,
  corpIndustryJobCopy,
  corpRosterCopy,
  corpWalletCopy,
  priceAlertCopy,
  type DomainCopy,
  type NoNames,
  type SkillNames,
  type ItemNames,
  type PlanetNames,
  type CalendarNames,
  type MemberNames,
} from './domainCopy';
import type { EveNotificationNames } from './eveNotificationText';
import type { NotificationEventId } from './events';
import { THRESHOLD_FIELDS, type ThresholdField } from './eventThresholds';

/** Every fire any registered diff can produce. */
export type AnyNotificationFire =
  | NotificationFire
  | SpExtractionFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ExtractorExpiringFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire
  | MarketOrderUndercutFire
  | EveNotificationFire
  | StructureFuelLowFire
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire
  | PriceAlertTriggeredFire;

/* -------------------------------------------------------------------------- */
/* Snapshot sources                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A typed handle on one poll domain's snapshot: the domain in
 * `pollDomains.ts` that fetches it and every entry that diffs it name the
 * same handle, so an entry's `diff` and `copy` are checked against the
 * snapshot and name-lookup shapes that domain actually produces.
 */
export interface SnapshotSource<TSnapshot, TNames> {
  readonly id: string;
  /** Type-only carrier for `TSnapshot`/`TNames`; never set at runtime. */
  readonly types?: (snapshot: TSnapshot, names: TNames) => void;
}

function source<TSnapshot, TNames = NoNames>(id: string): SnapshotSource<TSnapshot, TNames> {
  return { id };
}

export const SNAPSHOT_SOURCES = {
  skillQueue: source<SkillQueueSnapshot, SkillNames>('skillQueue'),
  spExtraction: source<SpExtractionSnapshot>('spExtraction'),
  industryJobs: source<IndustryJobSnapshot, ItemNames>('industryJobs'),
  colonies: source<PlanetarySnapshot, PlanetNames>('colonies'),
  mail: source<MailSnapshot>('mail'),
  calendar: source<CalendarSnapshot, CalendarNames>('calendar'),
  contracts: source<ContractSnapshot>('contracts'),
  wallet: source<WalletSnapshot>('wallet'),
  marketOrders: source<MarketOrderSnapshot, ItemNames>('marketOrders'),
  marketOrderUndercut: source<OrderUndercutSnapshot, ItemNames>('marketOrderUndercut'),
  eveNotification: source<EveNotificationSnapshot, EveNotificationNames>('eveNotification'),
  structureFuel: source<StructureFuelSnapshot>('structureFuel'),
  corpIndustryJobs: source<CorpIndustryJobSnapshot, ItemNames>('corpIndustryJobs'),
  corpRoster: source<CorpRosterSnapshot, MemberNames>('corpRoster'),
  corpWallet: source<CorpWalletSnapshot>('corpWallet'),
  priceAlert: source<PriceAlertSnapshot>('priceAlert'),
} as const;

/* -------------------------------------------------------------------------- */
/* Entry shape                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How a projectable event reads as a Scheduled Push. The fire and names are
 * the ones its domain's `project*` builds (`engine/projection.ts`), which for
 * `eveNotification` is a narrower derived fire, not its poll fire.
 */
export interface EventProjection<TPushFire, TPushNames> {
  readonly push: PushCopy<TPushFire, TPushNames>;
  /**
   * False when only some occurrences are projected (`eveNotification`: only
   * a structure's reinforcement exit), so Settings' Scheduled Push badge —
   * a promise about every occurrence — stays off its row.
   */
  readonly everyOccurrence: boolean;
}

/** The per-Character threshold fields an event owns, rendered inline under its Settings row. */
export interface EventThresholds {
  readonly fields: readonly [ThresholdField, ...ThresholdField[]];
  /** A caveat shown under the controls, or null. */
  readonly hintKey: string | null;
}

/** One Event Entry, as written. `defineEvent` checks it against its source's types. */
export interface NotificationEventEntry<
  TSnapshot,
  TFire,
  TNames,
  TProjection extends EventProjection<never, never> | null,
  TThresholds extends EventThresholds | null,
> {
  readonly source: SnapshotSource<TSnapshot, TNames>;
  readonly diff: (characterId: number, prev: TSnapshot | undefined, next: TSnapshot) => TFire[];
  readonly copy: DomainCopy<TFire, TNames>;
  readonly projection: TProjection;
  readonly thresholds: TThresholds;
  /** i18n key of a caveat Settings shows under this event's row whatever the Character's grants, or null. */
  readonly rowHintKey: string | null;
}

/**
 * Identity at runtime; at compile time it infers one entry's snapshot, fire
 * and names types from its `source`, so `diff` and `copy` must agree with
 * each other and with what the domain produces.
 */
function defineEvent<
  TSnapshot,
  TFire,
  TNames,
  TProjection extends EventProjection<never, never> | null,
  TThresholds extends EventThresholds | null,
>(
  entry: NotificationEventEntry<TSnapshot, TFire, TNames, TProjection, TThresholds>
): NotificationEventEntry<TSnapshot, TFire, TNames, TProjection, TThresholds> {
  return entry;
}

/**
 * An entry as the poll loop and Settings see it, its types erased. Method
 * syntax on purpose: method parameters compare bivariantly, which is what
 * lets every typed entry satisfy this one shape without a cast. The domain
 * only ever hands an entry its own source's snapshot and fires
 * (`pollDomains.ts`), which is what makes that sound in practice.
 */
export interface ErasedEventEntry {
  readonly source: { readonly id: string };
  diff(characterId: number, prev: unknown, next: unknown): AnyNotificationFire[];
  readonly copy: {
    poll(fire: unknown, characterName: string, names: unknown): NotificationCopy;
    subjectOf?(fire: unknown): number | undefined;
  };
  readonly projection: ErasedProjection | null;
  readonly thresholds: EventThresholds | null;
  readonly rowHintKey: string | null;
}

interface ErasedProjection {
  push(fire: unknown, characterName: string, names: unknown): NotificationCopy;
  readonly everyOccurrence: boolean;
}

type ErasedEntryFor<K extends NotificationEventId> = ErasedEventEntry & {
  readonly projection: K extends ProjectableEventId ? ErasedProjection : null;
};

/* -------------------------------------------------------------------------- */
/* The catalog                                                                 */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_EVENT_ENTRIES = {
  skillLevelComplete: defineEvent({
    source: SNAPSHOT_SOURCES.skillQueue,
    diff: SKILL_QUEUE_NOTIFICATION_DIFFS.skillLevelComplete,
    copy: skillQueueCopy,
    projection: { push: skillQueueCopy.push, everyOccurrence: true },
    thresholds: null,
    rowHintKey: null,
  }),
  characterNotTraining: defineEvent({
    source: SNAPSHOT_SOURCES.skillQueue,
    diff: SKILL_QUEUE_NOTIFICATION_DIFFS.characterNotTraining,
    copy: skillQueueCopy,
    projection: { push: skillQueueCopy.push, everyOccurrence: true },
    thresholds: null,
    rowHintKey: null,
  }),
  skillQueueEnding: defineEvent({
    source: SNAPSHOT_SOURCES.skillQueue,
    diff: SKILL_QUEUE_NOTIFICATION_DIFFS.skillQueueEnding,
    copy: skillQueueCopy,
    projection: { push: skillQueueCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.skillQueueEndingLeadHours], hintKey: null },
    rowHintKey: null,
  }),
  // Opt-in behind sync.spExtractionMonitoringEnabled, with its threshold a
  // single account-wide setting (`Settings.tsx`), not a per-Character field.
  spExtractionReady: defineEvent({
    source: SNAPSHOT_SOURCES.spExtraction,
    diff: diffSpExtractionReady,
    copy: spExtractionCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  industryJobComplete: defineEvent({
    source: SNAPSHOT_SOURCES.industryJobs,
    diff: diffIndustryJobComplete,
    copy: industryJobCopy,
    projection: { push: industryJobCopy.push, everyOccurrence: true },
    thresholds: null,
    rowHintKey: null,
  }),
  newMail: defineEvent({
    source: SNAPSHOT_SOURCES.mail,
    diff: diffNewMail,
    copy: mailCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  planetaryExtractionDone: defineEvent({
    source: SNAPSHOT_SOURCES.colonies,
    diff: diffPlanetaryExtractionDone,
    copy: colonyCopy,
    projection: { push: colonyCopy.push, everyOccurrence: true },
    thresholds: null,
    rowHintKey: null,
  }),
  planetaryExtractorExpiring: defineEvent({
    source: SNAPSHOT_SOURCES.colonies,
    diff: diffPlanetaryExtractorExpiring,
    copy: colonyCopy,
    projection: { push: colonyCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.extractorExpiringLeadHours], hintKey: null },
    // Delivery disclosure (issues #310/#358): bounded by the 72-hour
    // Projection Horizon, not the Character's grants, so it shows even
    // before authorization.
    rowHintKey: 'settings.notifications.extractorExpiringHint',
  }),
  marketOrderFilled: defineEvent({
    source: SNAPSHOT_SOURCES.marketOrders,
    diff: diffMarketOrderFilled,
    copy: marketOrderCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  // Foreground-only, station-only (issue #1423, owner decisions #1/#2) — no
  // Scheduled Push (needs a re-check the projector never does) and no
  // system/region scope yet.
  marketOrderUndercut: defineEvent({
    source: SNAPSHOT_SOURCES.marketOrderUndercut,
    diff: diffMarketOrderUndercut,
    copy: marketOrderUndercutCopy,
    projection: null,
    thresholds: null,
    rowHintKey: 'settings.notifications.marketOrderUndercutStationOnlyHint',
  }),
  newCalendarEvent: defineEvent({
    source: SNAPSHOT_SOURCES.calendar,
    diff: diffNewCalendarEvent,
    copy: calendarCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  calendarEventStarting: defineEvent({
    source: SNAPSHOT_SOURCES.calendar,
    diff: diffCalendarEventStarting,
    copy: calendarCopy,
    projection: { push: calendarCopy.push, everyOccurrence: true },
    thresholds: null,
    rowHintKey: null,
  }),
  contractAccepted: defineEvent({
    source: SNAPSHOT_SOURCES.contracts,
    diff: diffContractAccepted,
    copy: contractCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  contractCompleted: defineEvent({
    source: SNAPSHOT_SOURCES.contracts,
    diff: diffContractCompleted,
    copy: contractCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  contractFailed: defineEvent({
    source: SNAPSHOT_SOURCES.contracts,
    diff: diffContractFailed,
    copy: contractCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  courierDeliveryDue: defineEvent({
    source: SNAPSHOT_SOURCES.contracts,
    diff: diffCourierDeliveryDue,
    copy: contractCopy,
    projection: { push: contractCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.courierDeliveryDueLeadHours], hintKey: null },
    rowHintKey: null,
  }),
  walletBalanceChanged: defineEvent({
    source: SNAPSHOT_SOURCES.wallet,
    diff: diffWalletBalanceChanged,
    copy: walletCopy,
    projection: null,
    thresholds: {
      fields: [THRESHOLD_FIELDS.walletBalanceChangedThresholdIsk],
      hintKey: 'settings.notifications.walletBalanceChangedThresholdHint',
    },
    rowHintKey: null,
  }),
  eveNotification: defineEvent({
    source: SNAPSHOT_SOURCES.eveNotification,
    diff: diffEveNotification,
    copy: eveNotificationCopy,
    // Only a structure's reinforcement exit (issue #359) has a future
    // instant to project; every other EVE notification is "as it happens".
    projection: { push: eveNotificationCopy.push, everyOccurrence: false },
    thresholds: null,
    rowHintKey: null,
  }),
  structureFuelLow: defineEvent({
    source: SNAPSHOT_SOURCES.structureFuel,
    diff: diffStructureFuelLow,
    copy: structureFuelCopy,
    projection: { push: structureFuelCopy.push, everyOccurrence: true },
    thresholds: {
      fields: [THRESHOLD_FIELDS.structureFuelLowDays],
      // Issue #299: "say so in the UI, so nobody reads it as a second copy
      // of the EVE alert."
      hintKey: 'settings.notifications.structureFuelLowNotDuplicateHint',
    },
    rowHintKey: null,
  }),
  corpIndustryJobReady: defineEvent({
    source: SNAPSHOT_SOURCES.corpIndustryJobs,
    diff: diffCorpIndustryJobReady,
    copy: corpIndustryJobCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  corpMemberJoined: defineEvent({
    source: SNAPSHOT_SOURCES.corpRoster,
    diff: diffCorpMemberJoined,
    copy: corpRosterCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  corpMemberLeft: defineEvent({
    source: SNAPSHOT_SOURCES.corpRoster,
    diff: diffCorpMemberLeft,
    copy: corpRosterCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  corpWalletThreshold: defineEvent({
    source: SNAPSHOT_SOURCES.corpWallet,
    diff: diffCorpWalletThreshold,
    copy: corpWalletCopy,
    projection: null,
    // Two independent thresholds, either of which fires (issue #299).
    thresholds: {
      fields: [
        THRESHOLD_FIELDS.corpWalletBalanceFloorIsk,
        THRESHOLD_FIELDS.corpWalletTransactionCeilingIsk,
      ],
      hintKey: null,
    },
    rowHintKey: null,
  }),
  priceAlertTriggered: defineEvent({
    source: SNAPSHOT_SOURCES.priceAlert,
    diff: diffPriceAlertTriggered,
    copy: priceAlertCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
} satisfies { readonly [K in NotificationEventId]: ErasedEntryFor<K> };

const ERASED: { readonly [K in NotificationEventId]: ErasedEventEntry } =
  NOTIFICATION_EVENT_ENTRIES;

/** One event's entry, types erased — for callers that hold only an id. */
export function eventEntry(eventId: NotificationEventId): ErasedEventEntry {
  return ERASED[eventId];
}
