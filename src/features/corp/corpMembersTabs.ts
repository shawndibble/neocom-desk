/**
 * `/corp/members` tabs (ADR 0015): the roster, and the Roles audit a Director
 * with the titles scope sees (`canReadRoleAudit`; without it the page draws no
 * tab bar and the Roles path falls back to the roster).
 */
import { definePageTabs } from '@/lib/pageTabs';

export const CORP_MEMBERS_TABS = definePageTabs('/corp/members', [
  { id: 'members', labelKey: 'corp.membersTab' },
  { id: 'roles', labelKey: 'corp.roles.tab' },
]);

/** The Roles tab was `?tab=roles` before it was a path segment; an old link moves to the path. */
export function legacyCorpMembersLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  if (pathname.replace(/\/$/, '') !== '/corp/members') return null;
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab !== 'roles' && tab !== 'members') return null;
  params.delete('tab');
  const rest = params.toString();
  return { pathname: `/corp/members/${tab}`, search: rest ? `?${rest}` : '' };
}
