import { useNewRequestCount } from '@/features/communities/requestBadge';
import type { AppRoutePath } from './routeScopes';

export interface NavBadge {
  badge?: number;
  badgeLabelKey?: string;
}

/**
 * What waits at each nav destination, read once by the component that builds
 * the entries and spread onto `NavItem`. Only Communities has one: the count
 * of new Requests (issue #3810).
 */
export function useNavBadges(): (path: AppRoutePath) => NavBadge {
  const newRequests = useNewRequestCount();
  return (path) =>
    path === '/communities'
      ? { badge: newRequests, badgeLabelKey: 'nav.communitiesNewRequests' }
      : {};
}
