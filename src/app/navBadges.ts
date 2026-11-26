import { useNewRequestCount } from '@/features/communities/requestBadge';
import { useMoonsNavAttention } from '@/features/corp/moons/moonsNavAttention';
import type { AppRoutePath } from './routeScopes';

export interface NavBadge {
  badge?: number;
  badgeLabelKey?: string;
  attention?: boolean;
}

export function useNavBadges(): (path: AppRoutePath) => NavBadge {
  const newRequests = useNewRequestCount();
  const moonsAttention = useMoonsNavAttention();
  return (path) => {
    if (path === '/communities')
      return { badge: newRequests, badgeLabelKey: 'nav.communitiesNewRequests' };
    if (path === '/corp/moons') return { attention: moonsAttention };
    return {};
  };
}
