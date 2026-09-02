/**
 * The fixed catalog of Notification Events (CONTEXT.md round 20): every
 * character-state change a user can be notified about, each independently
 * toggleable per Character. Scopes are derived from `ESI_REGISTRY`, never
 * hand-copied, so an endpoint that changes scope upstream updates this table
 * for free (same rule `app/routeScopes.ts` follows).
 */
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId, type Scope } from '@/esi/registry';

export type NotificationEventId =
  | 'skillLevelComplete'
  | 'characterNotTraining'
  | 'industryJobComplete'
  | 'newMail'
  | 'planetaryExtractionDone'
  | 'marketOrderFilled'
  | 'newCalendarEvent'
  | 'calendarEventStarting'
  | 'contractAccepted'
  | 'walletBalanceChanged';

export interface NotificationEventDef {
  readonly id: NotificationEventId;
  /** i18next key under the `settings.notifications.event.*` namespace. */
  readonly labelKey: string;
  readonly scope: Scope;
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
] as const;

export const NOTIFICATION_EVENT_IDS: readonly NotificationEventId[] = NOTIFICATION_EVENTS.map(
  (event) => event.id
);
