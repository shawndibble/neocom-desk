import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import { type DomainCopy, type NoNames, fired } from './shared';

export const communityJoinRequestCopy: DomainCopy<CommunityJoinRequestFire, NoNames> = {
  poll: (fire) => ({
    title: fired('communityJoinRequest', 'title', { community: fire.communityName }),
    body: fired('communityJoinRequest', 'body', {
      name: fire.characterName,
      community: fire.communityName,
    }),
  }),
};

export const communityMemberJoinedCopy: DomainCopy<CommunityMemberJoinedFire, NoNames> = {
  poll: (fire) => ({
    title: fired('communityMemberJoined', 'title', { community: fire.communityName }),
    body: fired('communityMemberJoined', 'body', {
      name: fire.characterName,
      community: fire.communityName,
    }),
  }),
};

export const communityRequestPledgedCopy: DomainCopy<CommunityRequestPledgedFire, NoNames> = {
  poll: (fire) => {
    const name = fire.characterName || fired('communityRequestPledged', 'someone');
    return {
      title: fired('communityRequestPledged', 'title', { community: fire.communityName }),
      body: fired('communityRequestPledged', 'body', {
        count: fire.count,
        name,
        community: fire.communityName,
        request: fire.requestLabel,
      }),
    };
  },
};
