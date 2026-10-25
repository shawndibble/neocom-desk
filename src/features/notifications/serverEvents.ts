/**
 * Server-pushed Notification Events (issue #5121; ADR 0027; decision
 * `20261025-073433-server-pushed-events-community-triggers-polled-price-alerts`):
 * the events a closed app is told about by the backend, with no EVE token
 * there. Community events are pushed when the backend writes them (a Firestore
 * trigger); price alerts and ship losses are read from public data on the
 * 15-minute dispatch tick.
 *
 * The device says which of them it wants, per Character, at registration —
 * the same per-device browser-channel model as the EVE notification types
 * (ADR 0020): each Character's sorted, de-duplicated `serverEvents`, limited to
 * {@link SERVER_PUSHED_EVENT_IDS}, plus the `serverInputs` the server cannot
 * read on its own. Pure apart from the injected readers.
 */
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { hasEventScope, type NotificationEventId } from './events';
import { isEventEnabledFor } from './eventSelection';
import type { PollDependencies } from './foregroundPoller';

/**
 * Every event the backend can push to a closed app on its own. Another
 * server-pushed event joins by adding its id here and handling it in
 * `functions/` (the server stores ids it does not know, and ignores them).
 */
export const SERVER_PUSHED_EVENT_IDS = [
  'communityJoinRequest',
  'communityMemberJoined',
  'communityRequestPledged',
  'priceAlertTriggered',
  'shipLost',
  // Need an Alerts Grant that carries the location (issue #5122, ADR 0028).
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly NotificationEventId[];

export type ServerPushedEventId = (typeof SERVER_PUSHED_EVENT_IDS)[number];

export function isServerPushedEvent(eventId: string): eventId is ServerPushedEventId {
  return (SERVER_PUSHED_EVENT_IDS as readonly string[]).includes(eventId);
}

/** The server-pushed events that need the Character's location (ADR 0028): pushed only under a location-capable Alerts Grant. */
export const NEARBY_SERVER_EVENT_IDS = [
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly ServerPushedEventId[];

export function isNearbyServerEvent(eventId: string): boolean {
  return (NEARBY_SERVER_EVENT_IDS as readonly string[]).includes(eventId);
}

/** Mirrors `functions/src/serverEvents.ts`'s `ServerEventInputs`. */
export interface ServerEventInputs {
  /** The hub station the Quickbar prices at; sent with `priceAlerts`. */
  priceStationId?: number;
  priceAlerts?: {
    typeId: number;
    name: string;
    targetPrice: number;
    direction: 'above' | 'below';
  }[];
  shipLostMinimumIsk?: number;
  /** This Character's N for `incursionNearby`; sent with it. */
  incursionNearbyJumps?: number;
  /** This Character's N for `skyhookRaidableNearby`; sent with it. */
  skyhookRaidableNearbyJumps?: number;
}

/** One Character's part of the registration. */
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

/**
 * Each Character's server-pushed events enabled for the browser channel, with
 * their inputs. A device that cannot show a pop-up (master off, browser gate
 * off, no permission) uploads empty lists, never nothing: an early return would
 * leave the server pushing the last list.
 */
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
