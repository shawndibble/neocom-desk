import type {
  CommunityAlertEntry,
  CommunityAlertSnapshot,
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

const isCommunityAlertEntry = shapeGuard<CommunityAlertEntry>({
  communityId: is.string,
  communityName: is.string,
  kind: is.oneOf(['request', 'member', 'pledgeRequest', 'pledge'] as const),
  uid: is.string,
  characterName: is.string,
  at: is.number,
  requestId: is.optional(is.string),
  requestLabel: is.optional(is.string),
});

export const communitiesDomain = defineDomain<
  CommunityAlertEntry,
  CommunityAlertSnapshot,
  CommunityJoinRequestFire | CommunityMemberJoinedFire | CommunityRequestPledgedFire
>({
  source: SNAPSHOT_SOURCES.communities,
  stateKey: 'notifications.pollerState.communities',
  entriesKey: 'entries',
  isEntry: isCommunityAlertEntry,
  load: async (characterId) => {
    try {
      const { loadCommunityAlertEntries } =
        await import('@/features/communities/communityAlertEntries');
      return await loadCommunityAlertEntries(characterId);
    } catch {
      return null;
    }
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
