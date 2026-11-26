import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { hasEventScope, type NotificationEventId } from './events';
import { isEventEnabledFor } from './eventSelection';
import type { PollDependencies } from './foregroundPoller';

export const SERVER_PUSHED_EVENT_IDS = [
  'communityJoinRequest',
  'communityMemberJoined',
  'communityRequestPledged',
  'priceAlertTriggered',
  'vettingShared',
  'corpTaxBookSyncStopped',
  'newMail',
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly NotificationEventId[];

export type ServerPushedEventId = (typeof SERVER_PUSHED_EVENT_IDS)[number];

export function isServerPushedEvent(eventId: string): eventId is ServerPushedEventId {
  return (SERVER_PUSHED_EVENT_IDS as readonly string[]).includes(eventId);
}

export const NEARBY_SERVER_EVENT_IDS = [
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly ServerPushedEventId[];

export function isNearbyServerEvent(eventId: string): boolean {
  return (NEARBY_SERVER_EVENT_IDS as readonly string[]).includes(eventId);
}

export const MAIL_SERVER_EVENT_IDS = ['newMail'] as const satisfies readonly ServerPushedEventId[];

export function isMailServerEvent(eventId: string): boolean {
  return (MAIL_SERVER_EVENT_IDS as readonly string[]).includes(eventId);
}

export interface ServerEventInputs {
  priceStationId?: number;
  priceAlerts?: {
    typeId: number;
    name: string;
    targetPrice: number;
    direction: 'above' | 'below';
  }[];
  incursionNearbyJumps?: number;
  skyhookRaidableNearbyJumps?: number;
}

export interface ServerEventRegistration {
  serverEvents: ServerPushedEventId[];
  serverInputs: ServerEventInputs;
}

const NONE: ServerEventRegistration = { serverEvents: [], serverInputs: {} };

export type ServerRegistrationDependencies = Pick<
  PollDependencies,
  | 'characters'
  | 'grantedScopes'
  | 'eventPrefsFor'
  | 'masterEnabled'
  | 'browserChannelEnabled'
  | 'permission'
  | 'serverInputsFor'
>;

export async function serverRegistrationsByCharacter(
  deps: ServerRegistrationDependencies
): Promise<Map<number, ServerEventRegistration>> {
  const [masterEnabled, browserAllowed, characters] = await Promise.all([
    deps.masterEnabled(),
    deps.browserChannelEnabled(),
    deps.characters(),
  ]);
  const browserEnabled = masterEnabled && browserAllowed && deps.permission() === 'granted';

  const byCharacter = new Map<number, ServerEventRegistration>();
  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async ({ characterId }) => {
    byCharacter.set(characterId, NONE);
    if (!browserEnabled) return;
    const [scopes, prefs] = await Promise.all([
      deps.grantedScopes(characterId),
      deps.eventPrefsFor(characterId),
    ]);
    const serverEvents = SERVER_PUSHED_EVENT_IDS.filter(
      (eventId) => hasEventScope(eventId, scopes) && isEventEnabledFor(prefs, eventId, 'browser')
    ).sort();
    if (serverEvents.length === 0) return;
    const serverInputs = (await deps.serverInputsFor?.(characterId, serverEvents)) ?? {};
    byCharacter.set(characterId, { serverEvents, serverInputs });
  });
  return byCharacter;
}
