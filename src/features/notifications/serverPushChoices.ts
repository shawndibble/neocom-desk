/**
 * What this device tells the server about the events the server pushes itself
 * (issues #5121, #5122): per Character, which of {@link SERVER_PUSHED_EVENT_IDS}
 * are on for the browser channel, and the N for the nearby ones. Sent with
 * every `registerDevice` upload, beside the EVE notification types (ADR 0020):
 * a server push is the closed-app analog of the browser channel, so the feed
 * column never counts. With the browser channel off, every list is empty, so
 * the server stops rather than pushing the last list.
 */
import type { CharacterEventThresholds } from './eventThresholdFields';
import { isEventEnabledFor, type EventEnabledMap } from './eventSelection';
import type { NotificationEventId } from './events';
import type { PollDependencies } from './foregroundPoller';
import type { RouteRules } from '@/features/route/routeRules';

/** The Notification Events the server detects and pushes on its own (not Scheduled Pushes). */
export const SERVER_PUSHED_EVENT_IDS = [
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly NotificationEventId[];

export interface ServerPushChoices {
  /** Sorted, de-duplicated. */
  serverEvents: string[];
  /** This Character's N for each nearby event, from its thresholds. */
  nearbyJumps: { incursionNearby: number; skyhookRaidableNearby: number };
}

export type ServerPushChoicesDependencies = Pick<
  PollDependencies,
  'characters' | 'masterEnabled' | 'browserChannelEnabled' | 'permission'
> & {
  eventPrefsFor: (characterId: number) => Promise<EventEnabledMap>;
  thresholdsFor: (
    characterId: number
  ) => Promise<
    Required<Pick<CharacterEventThresholds, 'incursionNearbyJumps' | 'skyhookRaidableNearbyJumps'>>
  >;
};

export async function serverPushChoicesByCharacter(
  deps: ServerPushChoicesDependencies
): Promise<Map<number, ServerPushChoices>> {
  const [masterEnabled, browserAllowed, characters] = await Promise.all([
    deps.masterEnabled(),
    deps.browserChannelEnabled(),
    deps.characters(),
  ]);
  const browserEnabled = masterEnabled && browserAllowed && deps.permission() === 'granted';
  const choices = new Map<number, ServerPushChoices>();
  await Promise.all(
    characters.map(async ({ characterId }) => {
      const [prefs, thresholds] = await Promise.all([
        deps.eventPrefsFor(characterId),
        deps.thresholdsFor(characterId),
      ]);
      choices.set(characterId, {
        serverEvents: browserEnabled
          ? SERVER_PUSHED_EVENT_IDS.filter((id) => isEventEnabledFor(prefs, id, 'browser')).sort()
          : [],
        nearbyJumps: {
          incursionNearby: thresholds.incursionNearbyJumps,
          skyhookRaidableNearby: thresholds.skyhookRaidableNearbyJumps,
        },
      });
    })
  );
  return choices;
}

/** The server-pushed events that need the Character's location (ADR 0027). */
export const NEARBY_SERVER_EVENT_IDS = [
  'incursionNearby',
  'skyhookRaidableNearby',
] as const satisfies readonly NotificationEventId[];

export function isNearbyServerEvent(eventId: string): boolean {
  return (NEARBY_SERVER_EVENT_IDS as readonly string[]).includes(eventId);
}

/**
 * This device's Travel Settings for the upload, so the server counts nearby
 * jumps as Route Safety does (`loadJumpBasis`'s rules, without the wormhole and
 * bridge shortcuts). Read only when some Character wants a nearby push: the
 * read can fetch the pod-kill list. `null` sends none, keeping what the server
 * stored; so does a failed read.
 */
export async function routeRulesForServer(
  choices: ReadonlyMap<number, ServerPushChoices>
): Promise<RouteRules | null> {
  const wanted = [...choices.values()].some((choice) =>
    choice.serverEvents.some(isNearbyServerEvent)
  );
  if (!wanted) return null;
  try {
    const { loadRouteRules } = await import('@/features/route/routeRules');
    return await loadRouteRules();
  } catch {
    return null;
  }
}
