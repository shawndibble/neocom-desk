/**
 * The fixed catalog of Notification Events (CONTEXT.md round 20): every
 * character-state change a user can be notified about, each independently
 * toggleable per Character. This is the service-worker-safe half of an event
 * — id, label, gates, channel default — and the id union is derived from it.
 * The other half (diff, copy, projectability, thresholds) is the event's
 * Event Entry in `eventEntries.ts`, which the service worker never imports. Scopes are derived from `ESI_REGISTRY`, never
 * hand-copied, so an endpoint that changes scope upstream updates this table
 * for free (same rule `app/routeScopes.ts` follows).
 */
import {
  ESI_REGISTRY,
  isScopeRequired,
  type EsiEndpointId,
  type Scope,
  type ScopeGroup,
} from '@/esi/registry';
import { permissionForScope } from '@/esi/scopes';
import type { CorpCapability } from '@/engine/corpRoles';

/** Everything a catalog row says about its event besides its id. */
interface NotificationEventTraits {
  /**
   * Which channels an untouched preference has on: `'both'` for nearly every
   * event, `'feedOnly'` for the few worth a Feed row but not an interruption
   * (CONTEXT.md round 45; `contractCompleted`/`contractFailed` by issue
   * #1091's explicit decision — a forfeited courier is irreversible by the
   * time you hear about it, so the value is the durable feed record, not a
   * popup). Read by `eventSelection.ts`'s absence-means-default idiom.
   */
  readonly defaultChannels: 'both' | 'feedOnly';
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

/**
 * A catalog row as written: `id` is any string here, because the id union is
 * derived *from* this list (below) — so adding a Notification Event is one row
 * in this array, and the compiler then demands its entry in
 * `eventEntries.ts`.
 */
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
    // A lead-time warning (issue #1410), so a pilot can top up the queue
    // before it goes idle — ESI has no write endpoint, so a paused or
    // already-empty queue is `characterNotTraining`'s to report, not this
    // event's.
    id: 'skillQueueEnding',
    labelKey: 'settings.notifications.event.skillQueueEnding',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterSkillQueue'),
  },
  {
    // Opt-in behind sync.spExtractionMonitoringEnabled — the scope below
    // just gates whether the event can fire at all once a pilot turns
    // monitoring on; `pollDomains.ts`'s spExtractionDomain checks the
    // setting itself before ever fetching skills for this reason.
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
    id: 'marketOrderFilled',
    labelKey: 'settings.notifications.event.marketOrderFilled',
    defaultChannels: 'feedOnly',
    scope: requiredScope('getCharacterOrders'),
  },
  {
    // Undercut for a sell order, outbid for a buy order, at the order's own
    // NPC station only (issue #1423, owner decisions #2/#3). 'both' — unlike
    // its marketOrderFilled sibling above — because the point of this one is
    // to be told promptly, not merely logged (owner decision #3).
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
    // A lead-time warning (issue #1713) for an accepted courier's deliver-by
    // deadline — `contractFailed` only arrives once the collateral is gone.
    id: 'courierDeliveryDue',
    labelKey: 'settings.notifications.event.courierDeliveryDue',
    defaultChannels: 'both',
    scope: requiredScope('getCharacterContracts'),
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
  // The five corp events below (issue #299) deliberately take the ordinary
  // `isEventEnabledFor` default-both-channels-on path (`eventSelection.ts`'s
  // "absence means enabled" idiom), never `eveTypeEnabledFor`'s
  // feed-on/browser-off default the ~100 `eveNotification` types use — they
  // are rare and high-stakes, not numerous and informational. CONTEXT.md
  // round 43 records this as a scope decision.
  {
    id: 'structureFuelLow',
    labelKey: 'settings.notifications.event.structureFuelLow',
    defaultChannels: 'both',
    scope: requiredScope('getCorporationStructures'),
    corpCapability: 'canReadStructures',
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
  // No ESI scope (see `NotificationEventDef.scope`'s doc) — pricing and the
  // Quickbar list are both scope-free.
  {
    id: 'priceAlertTriggered',
    labelKey: 'settings.notifications.event.priceAlertTriggered',
    defaultChannels: 'both',
  },
] as const satisfies readonly CatalogRow[];

export type NotificationEventId = (typeof CATALOG)[number]['id'];

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = CATALOG;

export const NOTIFICATION_EVENT_IDS: readonly NotificationEventId[] = NOTIFICATION_EVENTS.map(
  (event) => event.id
);

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

/** One event's i18n label key — a shared lookup so callers don't each build their own copy of this catalog map. */
const SCOPE_BY_EVENT = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.scope]));

/** Whether `scopes` covers this event; a scope-less event (`priceAlertTriggered`) always passes. */
export function hasEventScope(eventId: NotificationEventId, scopes: ReadonlySet<string>): boolean {
  const scope = SCOPE_BY_EVENT.get(eventId);
  return scope === undefined || scopes.has(scope);
}

/**
 * The Permission this event needs and `scopes` lacks, so Notification
 * settings can say "Needs the <Permission> permission" with a Grant link
 * (issue #1525). `null` when the scope is held, the event reads only public
 * data (`priceAlertTriggered`), or its scope is in the Core Grant — a missing
 * Core Grant scope has no Permission to ask for, so it stays a plain reauth.
 */
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

/**
 * Every corp event (issue #299) — the ones that get the best-effort
 * disclosure row. Derived from `corpCapability` rather than hand-listed, so
 * a future corp event picks up the disclosure by virtue of carrying that
 * field, not by also being added here — the one source both
 * `NotificationsPanel.tsx` and `notificationRows.ts` read, so they can't
 * drift apart (issue #740).
 */
const CORP_EVENT_ID_SET: ReadonlySet<NotificationEventId> = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.corpCapability !== undefined).map((event) => event.id)
);

export function isCorpEventId(eventId: NotificationEventId): boolean {
  return CORP_EVENT_ID_SET.has(eventId);
}
