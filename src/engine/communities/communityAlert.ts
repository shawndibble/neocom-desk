export interface CommunityAlertEntry {
  communityId: string;
  communityName: string;
  kind: 'request' | 'member' | 'pledgeRequest' | 'pledge';
  uid: string;
  characterName: string;
  at: number;
  requestId?: string;
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

export interface CommunityRequestPledgedFire {
  eventId: 'communityRequestPledged';
  characterId: number;
  communityId: string;
  communityName: string;
  uid: string;
  characterName: string;
  requestId: string;
  requestLabel: string;
  count: number;
  at: number;
}

const pledgeKey = (entry: CommunityAlertEntry) =>
  `${entry.communityId}:${entry.requestId ?? ''}:${entry.uid}`;

export function diffCommunityRequestPledged(
  characterId: number,
  prev: CommunityAlertSnapshot | undefined,
  next: CommunityAlertSnapshot
): CommunityRequestPledgedFire[] {
  if (!prev) return [];
  const seen = new Set(prev.entries.filter((e) => e.kind === 'pledge').map(pledgeKey));
  const listed = new Set(
    next.entries
      .filter((e) => e.kind === 'pledgeRequest')
      .map((e) => `${e.communityId}:${e.requestId}`)
  );
  const fresh = next.entries.filter(
    (e) =>
      e.kind === 'pledge' &&
      !seen.has(pledgeKey(e)) &&
      listed.has(`${e.communityId}:${e.requestId}`)
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
