/**
 * The Community alerts for an admin: a Character asking to join one of their
 * Communities, and a new Member arriving. Both diff the same poll of each
 * Community the Character administers (its waiting list and its roster).
 *
 * Edge-triggered on identity (community, uid): the first poll, and a
 * Community the pilot only just came to administer, are baselines and stay
 * quiet. A Member who was waiting in the previous poll was already announced
 * by the join request alert, so approving someone does not alert twice.
 */

export interface CommunityAlertEntry {
  communityId: string;
  communityName: string;
  /** A Character waiting to be let in, or one already in. */
  kind: 'request' | 'member';
  uid: string;
  characterName: string;
}

export interface CommunityAlertSnapshot {
  entries: readonly CommunityAlertEntry[];
  nowMs: number;
}

interface CommunityFireFields {
  characterId: number;
  communityId: string;
  communityName: string;
  uid: string;
  characterName: string;
}

export interface CommunityJoinRequestFire extends CommunityFireFields {
  eventId: 'communityJoinRequest';
}

export interface CommunityMemberJoinedFire extends CommunityFireFields {
  eventId: 'communityMemberJoined';
}

const key = (entry: CommunityAlertEntry) => `${entry.communityId}:${entry.uid}`;

function fields(characterId: number, entry: CommunityAlertEntry): CommunityFireFields {
  return {
    characterId,
    communityId: entry.communityId,
    communityName: entry.communityName,
    uid: entry.uid,
    characterName: entry.characterName,
  };
}

export function diffCommunityJoinRequest(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityJoinRequestFire[] {
  if (!prev) return [];
  const waiting = new Set(prev.entries.filter((e) => e.kind === 'request').map(key));
  return next.entries
    .filter((entry) => entry.kind === 'request' && !waiting.has(key(entry)))
    .map((entry) => ({ eventId: 'communityJoinRequest', ...fields(characterId, entry) }));
}

export function diffCommunityMemberJoined(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityMemberJoinedFire[] {
  if (!prev) return [];
  const known = new Set(prev.entries.map(key));
  const knownCommunities = new Set(prev.entries.map((e) => e.communityId));
  return next.entries
    .filter(
      (entry) =>
        entry.kind === 'member' && knownCommunities.has(entry.communityId) && !known.has(key(entry))
    )
    .map((entry) => ({ eventId: 'communityMemberJoined', ...fields(characterId, entry) }));
}
