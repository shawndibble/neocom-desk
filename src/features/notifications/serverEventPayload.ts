/**
 * The raw fire a server-pushed event carries (issue #5121): the push's `fire`
 * field, JSON of the same fire the Foreground Poller's diff would have built
 * (`functions/src/serverEvents.ts` builds it). The service worker parses it
 * here, renders it with the app's own copy (`serverEventCopy.ts`) and keys the
 * feed row with `occurrenceKey` — the Foreground Poller's own derivation, so the
 * open app finds the row instead of filing a second one.
 *
 * Strict per event: anything that does not read as that event's fire is null,
 * and the push falls back to the sender's plain title and body.
 */
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import type { PriceAlertTriggeredFire, ShipLostFire } from '@/engine/notificationDiffs';
import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import { INCURSION_STATES } from '@/engine/incursions/incursionRows';
import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import { is, shapeGuard } from './snapshotShape';
import type { ServerPushedEventId } from './serverEvents';

export type ServerEventFire =
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | PriceAlertTriggeredFire
  | ShipLostFire
  | IncursionNearbyFire
  | SkyhookRaidableNearbyFire;

const community = {
  characterId: is.number,
  communityId: is.string,
  communityName: is.string,
  uid: is.string,
  characterName: is.string,
  at: is.number,
};

const GUARDS: Record<ServerPushedEventId, (raw: unknown) => boolean> = {
  communityJoinRequest: shapeGuard<CommunityJoinRequestFire>({
    eventId: is.oneOf(['communityJoinRequest'] as const),
    ...community,
  }),
  communityMemberJoined: shapeGuard<CommunityMemberJoinedFire>({
    eventId: is.oneOf(['communityMemberJoined'] as const),
    ...community,
  }),
  communityRequestPledged: shapeGuard<CommunityRequestPledgedFire>({
    eventId: is.oneOf(['communityRequestPledged'] as const),
    ...community,
    requestId: is.string,
    requestLabel: is.string,
    count: is.number,
  }),
  priceAlertTriggered: shapeGuard<PriceAlertTriggeredFire>({
    eventId: is.oneOf(['priceAlertTriggered'] as const),
    characterId: is.number,
    typeId: is.number,
    name: is.string,
    price: is.number,
    targetPrice: is.number,
    direction: is.oneOf(['above', 'below'] as const),
  }),
  shipLost: shapeGuard<ShipLostFire>({
    eventId: is.oneOf(['shipLost'] as const),
    characterId: is.number,
    killmailId: is.number,
    timeMs: is.number,
    shipTypeId: is.optional(is.number),
    systemId: is.optional(is.number),
    value: is.optional(is.number),
  }),
  incursionNearby: shapeGuard<IncursionNearbyFire>({
    eventId: is.oneOf(['incursionNearby'] as const),
    characterId: is.number,
    constellationId: is.number,
    stagingSystemId: is.number,
    state: is.oneOf(INCURSION_STATES),
    jumps: is.number,
  }),
  skyhookRaidableNearby: shapeGuard<SkyhookRaidableNearbyFire>({
    eventId: is.oneOf(['skyhookRaidableNearby'] as const),
    characterId: is.number,
    systemId: is.number,
    planetId: is.number,
    startMs: is.number,
    endMs: is.number,
    jumps: is.number,
  }),
};

/**
 * The fire inside a push, or null. It must be the event and Character the
 * push itself names: a fire for someone else must never be filed under them.
 */
export function parseServerEventFire(
  eventId: string,
  characterId: number,
  rawJson: string
): ServerEventFire | null {
  if (!(eventId in GUARDS)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (!GUARDS[eventId as ServerPushedEventId](parsed)) return null;
  const fire = parsed as ServerEventFire;
  return fire.eventId === eventId && fire.characterId === characterId ? fire : null;
}
