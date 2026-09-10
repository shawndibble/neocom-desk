/**
 * The fixed catalog of Notification Events (CONTEXT.md round 20): every
 * character-state change a user can be notified about, each independently
 * toggleable per Character. Scopes are derived from `ESI_REGISTRY`, never
 * hand-copied, so an endpoint that changes scope upstream updates this table
 * for free (same rule `app/routeScopes.ts` follows).
 */
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId, type Scope } from '@/esi/registry';
import type { CorpCapability } from '@/engine/corpRoles';

export type NotificationEventId =
  | 'skillLevelComplete'
  | 'characterNotTraining'
  | 'spExtractionReady'
  | 'industryJobComplete'
  | 'newMail'
  | 'planetaryExtractionDone'
  | 'planetaryExtractorExpiring'
  | 'marketOrderFilled'
  | 'newCalendarEvent'
  | 'calendarEventStarting'
  | 'contractAccepted'
  | 'walletBalanceChanged'
  | 'eveNotification'
  | 'structureFuelLow'
  | 'corpIndustryJobReady'
  | 'corpMemberJoined'
  | 'corpMemberLeft'
  | 'corpWalletThreshold'
  | 'priceAlertTriggered';

export interface NotificationEventDef {
  readonly id: NotificationEventId;
  /** i18next key under the `settings.notifications.event.*` namespace. */
  readonly labelKey: string;
  /**
   * Absent only for `priceAlertTriggered` (issue #680): every other event
   * reads ESI data and so needs a real OAuth grant to fetch at all, but
   * price alerts poll Quickbar (local Dexie) and the public Fuzzwork
   * aggregate path, neither of which is behind any scope. `enabledEventsFor`
   * (`foregroundPoller.ts`) treats an absent scope as always-satisfied,
   * rather than this catalog borrowing an unrelated scope as a fake gate.
   */
  readonly scope?: Scope;
  /**
   * The second, role-shaped gate a corp event needs on top of `scope` (issue
   * #299): CCP role-gates the corporation endpoints server-side, so a granted
   * scope alone does not mean the Character can read the data
   * (`engine/corpRoles.ts`). Absent for every personal event — those answer
   * to `scope` alone.
   */
  readonly corpCapability?: CorpCapability;
}

function requiredScope(endpoint: EsiEndpointId): Scope {
  const scope = ESI_REGISTRY[endpoint].scope;
  if (!isScopeRequired(scope)) {
    throw new Error(`Notification event endpoint ${endpoint} has no OAuth scope`);
  }
  return scope;
}

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  {
    id: 'skillLevelComplete',
    labelKey: 'settings.notifications.event.skillLevelComplete',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    id: 'characterNotTraining',
    labelKey: 'settings.notifications.event.characterNotTraining',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    // Opt-in behind sync.spExtractionMonitoringEnabled — the scope below
    // just gates whether the event can fire at all once a pilot turns
    // monitoring on; `pollDomains.ts`'s spExtractionDomain checks the
    // setting itself before ever fetching skills for this reason.
    id: 'spExtractionReady',
    labelKey: 'settings.notifications.event.spExtractionReady',
    scope: requiredScope('getCharacterSkills'),
  },
  {
    id: 'industryJobComplete',
    labelKey: 'settings.notifications.event.industryJobComplete',
    scope: requiredScope('getCharacterIndustryJobs'),
  },
  {
    id: 'newMail',
    labelKey: 'settings.notifications.event.newMail',
    scope: requiredScope('getCharacterMailHeaders'),
  },
  {
    id: 'planetaryExtractionDone',
    labelKey: 'settings.notifications.event.planetaryExtractionDone',
    scope: requiredScope('getCharacterPlanets'),
  },
  {
    id: 'planetaryExtractorExpiring',
    labelKey: 'settings.notifications.event.planetaryExtractorExpiring',
    scope: requiredScope('getCharacterPlanets'),
  },
  {
    id: 'marketOrderFilled',
    labelKey: 'settings.notifications.event.marketOrderFilled',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    id: 'newCalendarEvent',
    labelKey: 'settings.notifications.event.newCalendarEvent',
    scope: requiredScope('getCharacterCalendar'),
  },
  {
    id: 'calendarEventStarting',
    labelKey: 'settings.notifications.event.calendarEventStarting',
    scope: requiredScope('getCharacterCalendar'),
  },
  {
    id: 'contractAccepted',
    labelKey: 'settings.notifications.event.contractAccepted',
    scope: requiredScope('getCharacterContracts'),
  },
  {
    id: 'walletBalanceChanged',
    labelKey: 'settings.notifications.event.walletBalanceChanged',
    scope: requiredScope('getCharacterWallet'),
  },
  {
    id: 'eveNotification',
    labelKey: 'settings.notifications.event.eveNotification',
    scope: requiredScope('getCharacterNotifications'),
  },
  // The five corp events below (issue #299) deliberately take the ordinary
  // `isEventEnabledFor` default-both-channels-on path (`eventSelection.ts`'s
  // "absence means enabled" idiom), never `eveTypeEnabledFor`'s
  // feed-on/browser-off default the ~100 `eveNotification` types use — they
  // are rare and high-stakes, not numerous and informational. CONTEXT.md
  // round 43 records this as a scope decision.
  {
    id: 'structureFuelLow',
    labelKey: 'settings.notifications.event.structureFuelLow',
    scope: requiredScope('getCorporationStructures'),
    corpCapability: 'canReadStructures',
  },
  {
    id: 'corpIndustryJobReady',
    labelKey: 'settings.notifications.event.corpIndustryJobReady',
    scope: requiredScope('getCorporationIndustryJobs'),
    corpCapability: 'canReadIndustry',
  },
  {
    id: 'corpMemberJoined',
    labelKey: 'settings.notifications.event.corpMemberJoined',
    scope: requiredScope('getCorporationMembers'),
    corpCapability: 'canReadMembers',
  },
  {
    id: 'corpMemberLeft',
    labelKey: 'settings.notifications.event.corpMemberLeft',
    scope: requiredScope('getCorporationMembers'),
    corpCapability: 'canReadMembers',
  },
  {
    id: 'corpWalletThreshold',
    labelKey: 'settings.notifications.event.corpWalletThreshold',
    scope: requiredScope('getCorporationWallets'),
    corpCapability: 'canReadWallet',
  },
  // No ESI scope (see `NotificationEventDef.scope`'s doc) — pricing and the
  // Quickbar list are both scope-free.
  {
    id: 'priceAlertTriggered',
    labelKey: 'settings.notifications.event.priceAlertTriggered',
  },
] as const;

export const NOTIFICATION_EVENT_IDS: readonly NotificationEventId[] = NOTIFICATION_EVENTS.map(
  (event) => event.id
);

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

/** One event's i18n label key — a shared lookup so callers don't each build their own copy of this catalog map. */
export function eventLabelKey(eventId: NotificationEventId): string {
  const def = EVENT_BY_ID.get(eventId);
  if (!def) throw new Error(`Unknown Notification Event id: ${eventId}`);
  return def.labelKey;
}
