/**
 * The Community alerts: for an admin, a Character asking to join one of their
 * Communities and a new Member arriving (both diff the same poll of each
 * Community the Character administers: its waiting list and its roster); for
 * any Member, a Pledge on one of their own Requests (the same poll, other
 * entry kinds).
 *
 * Edge-triggered on identity (community, uid): the first poll, and a
 * Community the pilot only just came to administer (requests the admin
 * already sees on the page included), are baselines and stay quiet. A Member who was waiting in the previous poll was already announced
 * by the join request alert, so approving someone does not alert twice.
 */

export interface CommunityAlertEntry {
  communityId: string;
  communityName: string;
  /**
   * A Character waiting to be let in, or one already in; or, for Request
   * Pledges, one of this Character's own open Requests that asked for the app
   * (`pledgeRequest`) and a Member's Pledge on it (`pledge`).
   */
  kind: 'request' | 'member' | 'pledgeRequest' | 'pledge';
  uid: string;
  characterName: string;
  /**
   * When it asked (`requestedAt`), joined (`joinedAt`), the Request was posted
   * (`pledgeRequest`) or the Pledge was last written (`pledge`): a second ask
   * or join is its own occurrence.
   */
  at: number;
  /** The Request, on the two Pledge kinds. */
  requestId?: string;
  /** What the Request is for, in a word: its first line's item name. */
  requestLabel?: string;
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
  at: number;
}

export interface CommunityJoinRequestFire extends CommunityFireFields {
  eventId: 'communityJoinRequest';
}

export interface CommunityMemberJoinedFire extends CommunityFireFields {
  eventId: 'communityMemberJoined';
}

const key = (entry: CommunityAlertEntry) => `${entry.communityId}:${entry.uid}`;

/** The admin diffs read only the admin kinds: Pledge entries must not make a Community "known" or a uid "present". */
const isAdminEntry = (entry: CommunityAlertEntry) =>
  entry.kind === 'request' || entry.kind === 'member';

function fields(characterId: number, entry: CommunityAlertEntry): CommunityFireFields {
  return {
    characterId,
    communityId: entry.communityId,
    communityName: entry.communityName,
    uid: entry.uid,
    characterName: entry.characterName,
    at: entry.at,
  };
}

export function diffCommunityJoinRequest(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityJoinRequestFire[] {
  if (!prev) return [];
  const waiting = new Set(prev.entries.filter((e) => e.kind === 'request').map(key));
  const knownCommunities = new Set(prev.entries.filter(isAdminEntry).map((e) => e.communityId));
  return next.entries
    .filter(
      (entry) =>
        entry.kind === 'request' &&
        knownCommunities.has(entry.communityId) &&
        !waiting.has(key(entry))
    )
    .map((entry) => ({ eventId: 'communityJoinRequest', ...fields(characterId, entry) }));
}

export function diffCommunityMemberJoined(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityMemberJoinedFire[] {
  if (!prev) return [];
  const adminEntries = prev.entries.filter(isAdminEntry);
  const known = new Set(adminEntries.map(key));
  const knownCommunities = new Set(adminEntries.map((e) => e.communityId));
  return next.entries
    .filter(
      (entry) =>
        entry.kind === 'member' && knownCommunities.has(entry.communityId) && !known.has(key(entry))
    )
    .map((entry) => ({ eventId: 'communityMemberJoined', ...fields(characterId, entry) }));
}

/** New Pledges on this Character's own Requests, one fire per Community. */
export interface CommunityRequestPledgedFire {
  eventId: 'communityRequestPledged';
  characterId: number;
  communityId: string;
  communityName: string;
  /** The latest new Pledger, and the Request they Pledged on. */
  uid: string;
  characterName: string;
  requestId: string;
  requestLabel: string;
  /** New Pledges in this Community since the last poll. */
  count: number;
  /** When the latest was written: a Pledger who withdraws and Pledges again is a new occurrence. */
  at: number;
}

const pledgeKey = (entry: CommunityAlertEntry) =>
  `${entry.communityId}:${entry.requestId ?? ''}:${entry.uid}`;
const watchedKey = (entry: CommunityAlertEntry) => `${entry.communityId}:${entry.requestId ?? ''}`;

/**
 * A Member's Pledge that was not there at the previous poll, on a Request the
 * previous poll already watched or one posted since it (a Request cannot have
 * been Pledged on before it existed). A Request only just watched, say after
 * it was switched to the app or a Community was joined, is a baseline: its
 * Pledges are not announced. Several in one Community make one fire, naming
 * the latest.
 */
export function diffCommunityRequestPledged(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityRequestPledgedFire[] {
  if (!prev) return [];
  const watched = new Set(prev.entries.filter((e) => e.kind === 'pledgeRequest').map(watchedKey));
  const created = new Set(
    next.entries.filter((e) => e.kind === 'pledgeRequest' && e.at > prev.nowMs).map(watchedKey)
  );
  const seen = new Set(prev.entries.filter((e) => e.kind === 'pledge').map(pledgeKey));
  const fresh = next.entries.filter(
    (e) =>
      e.kind === 'pledge' &&
      !seen.has(pledgeKey(e)) &&
      (watched.has(watchedKey(e)) || created.has(watchedKey(e)))
  );
  const byCommunity = new Map<string, CommunityAlertEntry[]>();
  for (const entry of fresh) {
    byCommunity.set(entry.communityId, [...(byCommunity.get(entry.communityId) ?? []), entry]);
  }
  return [...byCommunity.values()].map((group) => {
    const latest = group.reduce((a, b) => (b.at >= a.at ? b : a));
    return {
      eventId: 'communityRequestPledged',
      characterId,
      communityId: latest.communityId,
      communityName: latest.communityName,
      uid: latest.uid,
      characterName: latest.characterName,
      requestId: latest.requestId ?? '',
      requestLabel: latest.requestLabel ?? '',
      count: group.length,
      at: latest.at,
    };
  });
}
