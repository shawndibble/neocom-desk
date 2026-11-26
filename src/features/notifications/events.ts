import {
  ESI_REGISTRY,
  isScopeRequired,
  type EsiEndpointId,
  type Scope,
  type ScopeGroup,
} from '@/esi/registry';
import { permissionForScope } from '@/esi/scopes';
import type { CorpCapability } from '@/engine/corpRoles';

interface NotificationEventTraits {
  readonly defaultChannels: 'both' | 'feedOnly';
  readonly labelKey: string;
  readonly scope?: Scope;
  readonly corpCapability?: CorpCapability;
}

export interface NotificationEventDef extends NotificationEventTraits {
  readonly id: NotificationEventId;
}

function requiredScope(endpoint: EsiEndpointId): Scope {
  const scope = ESI_REGISTRY[endpoint].scope;
  if (!isScopeRequired(scope)) {
    throw new Error(`Notification event endpoint ${endpoint} has no OAuth scope`);
  }
  return scope;
}

type CatalogRow = NotificationEventTraits & { readonly id: string };

const CATALOG = [
  {
    id: 'skillLevelComplete',
    labelKey: 'settings.notifications.event.skillLevelComplete',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    id: 'characterNotTraining',
    labelKey: 'settings.notifications.event.characterNotTraining',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    id: 'skillQueueEnding',
    labelKey: 'settings.notifications.event.skillQueueEnding',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    id: 'omegaLapsed',
    labelKey: 'settings.notifications.event.omegaLapsed',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    id: 'spExtractionReady',
    labelKey: 'settings.notifications.event.spExtractionReady',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkills'),
  },
  {
    id: 'industryJobComplete',
    labelKey: 'settings.notifications.event.industryJobComplete',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterIndustryJobs'),
  },
  {
    id: 'cloneJumpReady',
    labelKey: 'settings.notifications.event.cloneJumpReady',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterClones'),
  },
  {
    id: 'newMail',
    labelKey: 'settings.notifications.event.newMail',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterMailHeaders'),
  },
  {
    id: 'planetaryExtractionDone',
    labelKey: 'settings.notifications.event.planetaryExtractionDone',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterPlanets'),
  },
  {
    id: 'planetaryExtractorExpiring',
    labelKey: 'settings.notifications.event.planetaryExtractorExpiring',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterPlanets'),
  },
  {
    id: 'acceleratorExpiring',
    labelKey: 'settings.notifications.event.acceleratorExpiring',
    defaultChannels: 'both',
  },
  {
    id: 'acceleratorEnded',
    labelKey: 'settings.notifications.event.acceleratorEnded',
    defaultChannels: 'both',
  },
  {
    id: 'mercenaryDenReinforced',
    labelKey: 'settings.notifications.event.mercenaryDenReinforced',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterMercenaryDens'),
  },
  {
    id: 'mercenaryDenAnarchy',
    labelKey: 'settings.notifications.event.mercenaryDenAnarchy',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterMercenaryDens'),
  },
  {
    id: 'sharedMoonPop',
    labelKey: 'settings.notifications.event.sharedMoonPop',
    defaultChannels: 'both',
  },
  {
    id: 'marketOrderFilled',
    labelKey: 'settings.notifications.event.marketOrderFilled',
    defaultChannels: 'feedOnly',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    id: 'marketOrderUndercut',
    labelKey: 'settings.notifications.event.marketOrderUndercut',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    id: 'newCalendarEvent',
    labelKey: 'settings.notifications.event.newCalendarEvent',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterCalendar'),
  },
  {
    id: 'calendarEventStarting',
    labelKey: 'settings.notifications.event.calendarEventStarting',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterCalendar'),
  },
  {
    id: 'contractAccepted',
    labelKey: 'settings.notifications.event.contractAccepted',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'contractCompleted',
    labelKey: 'settings.notifications.event.contractCompleted',
    defaultChannels: 'feedOnly',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'contractFailed',
    labelKey: 'settings.notifications.event.contractFailed',
    defaultChannels: 'feedOnly',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'courierDeliveryDue',
    labelKey: 'settings.notifications.event.courierDeliveryDue',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'contractExpiring',
    labelKey: 'settings.notifications.event.contractExpiring',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'ordersLapsing',
    labelKey: 'settings.notifications.event.ordersLapsing',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    id: 'walletBalanceChanged',
    labelKey: 'settings.notifications.event.walletBalanceChanged',
    defaultChannels: 'feedOnly',
    scope: requiredScope('getCharacterWallet'),
  },
  {
    id: 'eveNotification',
    labelKey: 'settings.notifications.event.eveNotification',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterNotifications'),
  },
  {
    id: 'structureFuelLow',
    labelKey: 'settings.notifications.event.structureFuelLow',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationStructures'),
    corpCapability: 'canReadStructures',
  },
  {
    id: 'skyhookRaidable',
    labelKey: 'settings.notifications.event.skyhookRaidable',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationSkyhooks'),
    corpCapability: 'canReadSkyhooks',
  },
  {
    id: 'corpIndustryJobReady',
    labelKey: 'settings.notifications.event.corpIndustryJobReady',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationIndustryJobs'),
    corpCapability: 'canReadIndustry',
  },
  {
    id: 'corpMemberJoined',
    labelKey: 'settings.notifications.event.corpMemberJoined',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationMembers'),
    corpCapability: 'canReadMembers',
  },
  {
    id: 'corpMemberLeft',
    labelKey: 'settings.notifications.event.corpMemberLeft',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationMembers'),
    corpCapability: 'canReadMembers',
  },
  {
    id: 'corpWalletThreshold',
    labelKey: 'settings.notifications.event.corpWalletThreshold',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationWallets'),
    corpCapability: 'canReadWallet',
  },
  {
    id: 'priceAlertTriggered',
    labelKey: 'settings.notifications.event.priceAlertTriggered',
    defaultChannels: 'both',
  },
  {
    id: 'stockBelowTarget',
    labelKey: 'settings.notifications.event.stockBelowTarget',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    id: 'incursionNearby',
    labelKey: 'settings.notifications.event.incursionNearby',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterLocation'),
  },
  {
    id: 'skyhookRaidableNearby',
    labelKey: 'settings.notifications.event.skyhookRaidableNearby',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterLocation'),
  },
  {
    id: 'shipLost',
    labelKey: 'settings.notifications.event.shipLost',
    defaultChannels: 'both',
  },
  {
    id: 'characterNeedsLogin',
    labelKey: 'settings.notifications.event.characterNeedsLogin',
    defaultChannels: 'both',
  },
  {
    id: 'communityJoinRequest',
    labelKey: 'settings.notifications.event.communityJoinRequest',
    defaultChannels: 'both',
  },
  {
    id: 'communityMemberJoined',
    labelKey: 'settings.notifications.event.communityMemberJoined',
    defaultChannels: 'feedOnly',
  },
  {
    id: 'communityRequestPledged',
    labelKey: 'settings.notifications.event.communityRequestPledged',
    defaultChannels: 'feedOnly',
  },
  {
    id: 'vettingShared',
    labelKey: 'settings.notifications.event.vettingShared',
    defaultChannels: 'both',
  },
  {
    id: 'corpTaxBookSyncStopped',
    labelKey: 'settings.notifications.event.corpTaxBookSyncStopped',
    defaultChannels: 'both',
  },
] as const satisfies readonly CatalogRow[];

export type NotificationEventId = (typeof CATALOG)[number]['id'];

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = CATALOG;

export const NOTIFICATION_EVENT_IDS: readonly NotificationEventId[] = NOTIFICATION_EVENTS.map(
  (event) => event.id
);

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

const SCOPE_BY_EVENT = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.scope]));

export function eventScope(eventId: NotificationEventId): string | undefined {
  return SCOPE_BY_EVENT.get(eventId);
}

export function hasEventScope(eventId: NotificationEventId, scopes: ReadonlySet<string>): boolean {
  const scope = SCOPE_BY_EVENT.get(eventId);
  return scope === undefined || scopes.has(scope);
}

export function missingEventPermission(
  eventId: NotificationEventId,
  scopes: ReadonlySet<string>
): ScopeGroup | null {
  const scope = SCOPE_BY_EVENT.get(eventId);
  if (scope === undefined || scopes.has(scope)) return null;
  return permissionForScope(scope) ?? null;
}

export function eventLabelKey(eventId: NotificationEventId): string {
  const def = EVENT_BY_ID.get(eventId);
  if (!def) throw new Error(`Unknown Notification Event id: ${eventId}`);
  return def.labelKey;
}

const CORP_EVENT_ID_SET: ReadonlySet<NotificationEventId> = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.corpCapability !== undefined).map((event) => event.id)
);

export function isCorpEventId(eventId: NotificationEventId): boolean {
  return CORP_EVENT_ID_SET.has(eventId);
}
