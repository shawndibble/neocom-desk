import {
  diffStockBelowTarget,
  type StockAlertSnapshot,
  type StockBelowTargetFire,
} from '@/engine/stockTargets/stockAlert';
import {
  diffIncursionNearby,
  type IncursionAlertSnapshot,
  type IncursionNearbyFire,
} from '@/engine/incursions/incursionAlert';
import {
  diffSkyhookRaidableNearby,
  type SkyhookAlertSnapshot,
  type SkyhookRaidableNearbyFire,
} from '@/engine/skyhooks/skyhookAlert';
import {
  diffCommunityJoinRequest,
  diffCommunityMemberJoined,
  diffCommunityRequestPledged,
  type CommunityAlertSnapshot,
  type CommunityJoinRequestFire,
  type CommunityMemberJoinedFire,
  type CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import {
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffSpExtractionReady,
  diffCloneJumpReady,
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
  diffContractExpiring,
  diffOrdersLapsing,
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
  diffShipLost,
  type ShipLossSnapshot,
  type ShipLostFire,
  type NotificationFire,
  type SpExtractionFire,
  type CloneJumpReadyFire,
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
  type OrdersLapsingFire,
  type EveNotificationFire,
  type StructureFuelLowFire,
  type MercenaryDenReinforcedFire,
  type AcceleratorExpiringFire,
  type AcceleratorSnapshot,
  diffAcceleratorExpiring,
  type AcceleratorEndedFire,
  type AcceleratorPresenceSnapshot,
  diffAcceleratorEnded,
  type SkyhookRaidableFire,
  type SkyhookSnapshot,
  diffSkyhookRaidable,
  type MercenaryDenAnarchyFire,
  type DenSnapshot,
  diffMercenaryDenReinforced,
  diffMercenaryDenAnarchy,
  type CorpIndustryJobNotificationFire,
  type CorpMemberJoinedFire,
  type CorpMemberLeftFire,
  type CorpWalletThresholdFire,
  type PriceAlertTriggeredFire,
  type SkillQueueSnapshot,
  type SpExtractionSnapshot,
  type CloneJumpSnapshot,
  type IndustryJobSnapshot,
  type PlanetarySnapshot,
  type MailSnapshot,
  type CalendarSnapshot,
  type ContractSnapshot,
  type WalletSnapshot,
  type MarketOrderSnapshot,
  type OrderUndercutSnapshot,
  type OrderExpirySnapshot,
  type EveNotificationSnapshot,
  type StructureFuelSnapshot,
  type CorpIndustryJobSnapshot,
  type CorpRosterSnapshot,
  type CorpWalletSnapshot,
  type PriceAlertSnapshot,
  diffCharacterNeedsLogin,
  type CharacterNeedsLoginFire,
  type SignInSnapshot,
  diffSharedMoonPop,
  type SharedMoonPopFire,
  type SharedMoonPopSnapshot,
} from '@/engine/notificationDiffs';
import type { NotificationCopy } from '@/engine/notificationWording';
import type { ProjectableEventId, PushCopy } from '@/engine/projection';
import {
  skillQueueCopy,
  spExtractionCopy,
  industryJobCopy,
  cloneJumpCopy,
  colonyCopy,
  mailCopy,
  calendarCopy,
  contractCopy,
  walletCopy,
  marketOrderCopy,
  marketOrderUndercutCopy,
  ordersLapsingCopy,
  eveNotificationCopy,
  structureFuelCopy,
  mercenaryDenReinforcedCopy,
  acceleratorExpiringCopy,
  acceleratorEndedCopy,
  skyhookRaidableCopy,
  mercenaryDenAnarchyCopy,
  corpIndustryJobCopy,
  corpRosterCopy,
  corpWalletCopy,
  priceAlertCopy,
  stockBelowTargetCopy,
  incursionNearbyCopy,
  skyhookRaidableNearbyCopy,
  type SkyhookNames,
  shipLostCopy,
  type ShipLostNames,
  characterNeedsLoginCopy,
  communityJoinRequestCopy,
  communityMemberJoinedCopy,
  communityRequestPledgedCopy,
  vettingSharedCopy,
  corpTaxBookSyncStoppedCopy,
  sharedMoonPopCopy,
  type SharedMoonPopNames,
  type IncursionNames,
  type DomainCopy,
  type NoNames,
  type SkillNames,
  type ItemNames,
  type PlanetNames,
  type CalendarNames,
  type MemberNames,
} from './domainCopy';
import type { VettingSharedFire } from '@/engine/vettingAlert';
import type { CorpTaxBookSyncStoppedFire } from '@/engine/corpTaxBook/syncStoppedAlert';
import type { EveNotificationNames } from './eveNotificationText';
import type { NotificationEventId } from './events';
import { THRESHOLD_FIELDS, type ThresholdField } from './eventThresholdFields';

export type AnyNotificationFire =
  | NotificationFire
  | SpExtractionFire
  | CloneJumpReadyFire
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
  | OrdersLapsingFire
  | EveNotificationFire
  | StructureFuelLowFire
  | MercenaryDenReinforcedFire
  | AcceleratorExpiringFire
  | AcceleratorEndedFire
  | SkyhookRaidableFire
  | MercenaryDenAnarchyFire
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire
  | PriceAlertTriggeredFire
  | ShipLostFire
  | CharacterNeedsLoginFire
  | StockBelowTargetFire
  | IncursionNearbyFire
  | SkyhookRaidableNearbyFire
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | VettingSharedFire
  | CorpTaxBookSyncStoppedFire
  | SharedMoonPopFire;

export interface SnapshotSource<TSnapshot, TNames> {
  readonly id: string;
  readonly types?: (snapshot: TSnapshot, names: TNames) => void;
}

function source<TSnapshot, TNames = NoNames>(id: string): SnapshotSource<TSnapshot, TNames> {
  return { id };
}

export const SNAPSHOT_SOURCES = {
  skillQueue: source<SkillQueueSnapshot, SkillNames>('skillQueue'),
  spExtraction: source<SpExtractionSnapshot>('spExtraction'),
  cloneJump: source<CloneJumpSnapshot>('cloneJump'),
  industryJobs: source<IndustryJobSnapshot, ItemNames>('industryJobs'),
  colonies: source<PlanetarySnapshot, PlanetNames>('colonies'),
  mail: source<MailSnapshot>('mail'),
  calendar: source<CalendarSnapshot, CalendarNames>('calendar'),
  contracts: source<ContractSnapshot>('contracts'),
  wallet: source<WalletSnapshot>('wallet'),
  marketOrders: source<MarketOrderSnapshot, ItemNames>('marketOrders'),
  marketOrderUndercut: source<OrderUndercutSnapshot, ItemNames>('marketOrderUndercut'),
  orderExpiry: source<OrderExpirySnapshot>('orderExpiry'),
  eveNotification: source<EveNotificationSnapshot, EveNotificationNames>('eveNotification'),
  structureFuel: source<StructureFuelSnapshot>('structureFuel'),
  mercenaryDens: source<DenSnapshot, PlanetNames>('mercenaryDens'),
  accelerator: source<AcceleratorSnapshot>('accelerator'),
  acceleratorPresence: source<AcceleratorPresenceSnapshot>('acceleratorPresence'),
  skyhooks: source<SkyhookSnapshot, PlanetNames>('skyhooks'),
  corpIndustryJobs: source<CorpIndustryJobSnapshot, ItemNames>('corpIndustryJobs'),
  corpRoster: source<CorpRosterSnapshot, MemberNames>('corpRoster'),
  corpWallet: source<CorpWalletSnapshot>('corpWallet'),
  priceAlert: source<PriceAlertSnapshot>('priceAlert'),
  stockTargets: source<StockAlertSnapshot>('stockTargets'),
  kills: source<ShipLossSnapshot, ShipLostNames>('kills'),
  incursions: source<IncursionAlertSnapshot, IncursionNames>('incursions'),
  skyhooksNearby: source<SkyhookAlertSnapshot, SkyhookNames>('skyhooksNearby'),
  communities: source<CommunityAlertSnapshot>('communities'),
  signIn: source<SignInSnapshot>('signIn'),
  sharedMoonPops: source<SharedMoonPopSnapshot, SharedMoonPopNames>('sharedMoonPops'),
} as const;

export interface EventProjection<TPushFire, TPushNames> {
  readonly push: PushCopy<TPushFire, TPushNames>;
  readonly everyOccurrence: boolean;
}

export interface EventThresholds {
  readonly fields: readonly [ThresholdField, ...ThresholdField[]];
  readonly hintKey: string | null;
  readonly headingKey?: string;
}

export interface ServerOnlyEventEntry<TFire> {
  readonly source: null;
  readonly copy: DomainCopy<TFire, NoNames>;
  readonly projection: null;
  readonly thresholds: null;
  readonly rowHintKey: string | null;
}

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
  readonly rowHintKey: string | null;
}

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

function defineServerOnlyEvent<TFire>(
  entry: Pick<ServerOnlyEventEntry<TFire>, 'copy' | 'rowHintKey'>
): ServerOnlyEventEntry<TFire> {
  return { source: null, projection: null, thresholds: null, ...entry };
}

export interface ErasedEventEntry {
  readonly source: { readonly id: string } | null;
  diff?(characterId: number, prev: unknown, next: unknown): AnyNotificationFire[];
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
  omegaLapsed: defineEvent({
    source: SNAPSHOT_SOURCES.skillQueue,
    diff: SKILL_QUEUE_NOTIFICATION_DIFFS.omegaLapsed,
    copy: skillQueueCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
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
  cloneJumpReady: defineEvent({
    source: SNAPSHOT_SOURCES.cloneJump,
    diff: diffCloneJumpReady,
    copy: cloneJumpCopy,
    projection: { push: cloneJumpCopy.push, everyOccurrence: true },
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
    rowHintKey: 'settings.notifications.extractorExpiringHint',
  }),
  acceleratorExpiring: defineEvent({
    source: SNAPSHOT_SOURCES.accelerator,
    diff: diffAcceleratorExpiring,
    copy: acceleratorExpiringCopy,
    projection: { push: acceleratorExpiringCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.acceleratorExpiringLeadHours], hintKey: null },
    rowHintKey: null,
  }),
  acceleratorEnded: defineEvent({
    source: SNAPSHOT_SOURCES.acceleratorPresence,
    diff: diffAcceleratorEnded,
    copy: acceleratorEndedCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  mercenaryDenReinforced: defineEvent({
    source: SNAPSHOT_SOURCES.mercenaryDens,
    diff: diffMercenaryDenReinforced,
    copy: mercenaryDenReinforcedCopy,
    projection: { push: mercenaryDenReinforcedCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.mercenaryDenReinforcedLeadHours], hintKey: null },
    rowHintKey: 'settings.notifications.mercenaryDenReinforcedHint',
  }),
  mercenaryDenAnarchy: defineEvent({
    source: SNAPSHOT_SOURCES.mercenaryDens,
    diff: diffMercenaryDenAnarchy,
    copy: mercenaryDenAnarchyCopy,
    projection: null,
    thresholds: { fields: [THRESHOLD_FIELDS.mercenaryDenAnarchyPercent], hintKey: null },
    rowHintKey: 'settings.notifications.mercenaryDenAnarchyForegroundOnlyHint',
  }),
  sharedMoonPop: defineEvent({
    source: SNAPSHOT_SOURCES.sharedMoonPops,
    diff: diffSharedMoonPop,
    copy: sharedMoonPopCopy,
    projection: { push: sharedMoonPopCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.sharedMoonPopLeadMinutes], hintKey: null },
    rowHintKey: null,
  }),
  marketOrderFilled: defineEvent({
    source: SNAPSHOT_SOURCES.marketOrders,
    diff: diffMarketOrderFilled,
    copy: marketOrderCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
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
  contractExpiring: defineEvent({
    source: SNAPSHOT_SOURCES.contracts,
    diff: diffContractExpiring,
    copy: contractCopy,
    projection: { push: contractCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.contractExpiringLeadHours], hintKey: null },
    rowHintKey: null,
  }),
  ordersLapsing: defineEvent({
    source: SNAPSHOT_SOURCES.orderExpiry,
    diff: diffOrdersLapsing,
    copy: ordersLapsingCopy,
    projection: { push: ordersLapsingCopy.push, everyOccurrence: true },
    thresholds: { fields: [THRESHOLD_FIELDS.ordersLapsingLeadHours], hintKey: null },
    rowHintKey: null,
  }),
  walletBalanceChanged: defineEvent({
    source: SNAPSHOT_SOURCES.wallet,
    diff: diffWalletBalanceChanged,
    copy: walletCopy,
    projection: null,
    thresholds: {
      fields: [
        THRESHOLD_FIELDS.walletFoldIntoContract,
        THRESHOLD_FIELDS.walletBalanceChangedThresholdIsk,
      ],
      hintKey: 'settings.notifications.walletBalanceChangedThresholdHint',
      headingKey: 'settings.notifications.minimumIskChangeAlert',
    },
    rowHintKey: null,
  }),
  eveNotification: defineEvent({
    source: SNAPSHOT_SOURCES.eveNotification,
    diff: diffEveNotification,
    copy: eveNotificationCopy,
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
      hintKey: 'settings.notifications.structureFuelLowNotDuplicateHint',
    },
    rowHintKey: null,
  }),
  skyhookRaidable: defineEvent({
    source: SNAPSHOT_SOURCES.skyhooks,
    diff: diffSkyhookRaidable,
    copy: skyhookRaidableCopy,
    projection: { push: skyhookRaidableCopy.push, everyOccurrence: true },
    thresholds: {
      fields: [THRESHOLD_FIELDS.skyhookRaidableLeadHours, THRESHOLD_FIELDS.skyhookRaidableMinUnits],
      hintKey: 'settings.notifications.skyhookRaidableMinUnitsHint',
    },
    rowHintKey: 'settings.notifications.skyhookRaidableHint',
  }),
  corpIndustryJobReady: defineEvent({
    source: SNAPSHOT_SOURCES.corpIndustryJobs,
    diff: diffCorpIndustryJobReady,
    copy: corpIndustryJobCopy,
    projection: { push: corpIndustryJobCopy.push, everyOccurrence: true },
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
  stockBelowTarget: defineEvent({
    source: SNAPSHOT_SOURCES.stockTargets,
    diff: diffStockBelowTarget,
    copy: stockBelowTargetCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  incursionNearby: defineEvent({
    source: SNAPSHOT_SOURCES.incursions,
    diff: diffIncursionNearby,
    copy: incursionNearbyCopy,
    projection: null,
    thresholds: {
      fields: [THRESHOLD_FIELDS.incursionNearbyJumps],
      hintKey: 'settings.notifications.incursionNearbyRouteRulesHint',
    },
    rowHintKey: null,
  }),
  skyhookRaidableNearby: defineEvent({
    source: SNAPSHOT_SOURCES.skyhooksNearby,
    diff: diffSkyhookRaidableNearby,
    copy: skyhookRaidableNearbyCopy,
    projection: null,
    thresholds: {
      fields: [THRESHOLD_FIELDS.skyhookRaidableNearbyJumps],
      hintKey: 'settings.notifications.skyhookRaidableNearbyRouteRulesHint',
    },
    rowHintKey: null,
  }),
  shipLost: defineEvent({
    source: SNAPSHOT_SOURCES.kills,
    diff: diffShipLost,
    copy: shipLostCopy,
    projection: null,
    thresholds: {
      fields: [THRESHOLD_FIELDS.shipLostMinimumIsk],
      hintKey: 'settings.notifications.shipLostMinimumIskHint',
    },
    rowHintKey: null,
  }),
  characterNeedsLogin: defineEvent({
    source: SNAPSHOT_SOURCES.signIn,
    diff: diffCharacterNeedsLogin,
    copy: characterNeedsLoginCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  communityJoinRequest: defineEvent({
    source: SNAPSHOT_SOURCES.communities,
    diff: diffCommunityJoinRequest,
    copy: communityJoinRequestCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  communityMemberJoined: defineEvent({
    source: SNAPSHOT_SOURCES.communities,
    diff: diffCommunityMemberJoined,
    copy: communityMemberJoinedCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  communityRequestPledged: defineEvent({
    source: SNAPSHOT_SOURCES.communities,
    diff: diffCommunityRequestPledged,
    copy: communityRequestPledgedCopy,
    projection: null,
    thresholds: null,
    rowHintKey: null,
  }),
  vettingShared: defineServerOnlyEvent<VettingSharedFire>({
    copy: vettingSharedCopy,
    rowHintKey: 'settings.notifications.vettingSharedHint',
  }),
  corpTaxBookSyncStopped: defineServerOnlyEvent<CorpTaxBookSyncStoppedFire>({
    copy: corpTaxBookSyncStoppedCopy,
    rowHintKey: 'settings.notifications.corpTaxBookSyncStoppedHint',
  }),
} satisfies { readonly [K in NotificationEventId]: ErasedEntryFor<K> };

const ERASED: { readonly [K in NotificationEventId]: ErasedEventEntry } =
  NOTIFICATION_EVENT_ENTRIES;

export function eventEntry(eventId: NotificationEventId): ErasedEventEntry {
  return ERASED[eventId];
}
