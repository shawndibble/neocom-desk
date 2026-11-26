import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import type { PriceAlertTriggeredFire } from '@/engine/notificationDiffs';
import type { NewMailPushFire } from './serverEventCopy';
import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import { INCURSION_STATES } from '@/engine/incursions/incursionRows';
import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import type { VettingSharedFire } from '@/engine/vettingAlert';
import {
  SYNC_STOPPED_ALERT_REASONS,
  type CorpTaxBookSyncStoppedFire,
} from '@/engine/corpTaxBook/syncStoppedAlert';
import { is, shapeGuard } from './snapshotShape';
import type { ServerPushedEventId } from './serverEvents';

export type ServerEventFire =
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | PriceAlertTriggeredFire
  | NewMailPushFire
  | IncursionNearbyFire
  | SkyhookRaidableNearbyFire
  | VettingSharedFire
  | CorpTaxBookSyncStoppedFire;

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
  vettingShared: shapeGuard<VettingSharedFire>({
    eventId: is.oneOf(['vettingShared'] as const),
    characterId: is.number,
    corporationId: is.number,
    reviewId: is.string,
    kind: is.oneOf(['application', 'promotion'] as const),
  }),
  corpTaxBookSyncStopped: shapeGuard<CorpTaxBookSyncStoppedFire>({
    eventId: is.oneOf(['corpTaxBookSyncStopped'] as const),
    characterId: is.number,
    corporationId: is.number,
    reason: is.oneOf(SYNC_STOPPED_ALERT_REASONS),
    characterName: is.string,
    stoppedAt: is.number,
  }),
  newMail: shapeGuard<NewMailPushFire>({
    eventId: is.oneOf(['newMail'] as const),
    characterId: is.number,
    mailId: is.number,
    sentMs: is.optional(is.number),
    fromId: is.optional(is.number),
    subject: is.optional(is.string),
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
