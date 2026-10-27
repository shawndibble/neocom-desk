import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import i18n from '@/i18n';
import {
  communityJoinRequestText,
  communityMemberJoinedText,
  communityRequestPledgedText,
} from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

// The wording is shared with the service worker, which renders the same fires
// when the backend pushes them to a closed app (issue #5121).
const t = (key: string, vars?: Record<string, unknown>) => i18n.t(key, vars);

export const communityJoinRequestCopy: DomainCopy<CommunityJoinRequestFire, NoNames> = {
  poll: (fire) => communityJoinRequestText(t, fire),
};

export const communityMemberJoinedCopy: DomainCopy<CommunityMemberJoinedFire, NoNames> = {
  poll: (fire) => communityMemberJoinedText(t, fire),
};

export const communityRequestPledgedCopy: DomainCopy<CommunityRequestPledgedFire, NoNames> = {
  poll: (fire) => communityRequestPledgedText(t, fire),
};
