import { definePageTabs } from '@/lib/pageTabs';

export const CORP_MEMBERS_TABS = definePageTabs('/corp/members', [
  { id: 'roster', labelKey: 'corp.members.rosterTab' },
  { id: 'roles', labelKey: 'corp.roles.tab' },
]);

export function legacyCorpMembersLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  const path = pathname.replace(/\/$/, '');
  if (path === '/corp/members/members') return { pathname: '/corp/members/roster', search };
  if (path !== '/corp/members') return null;
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab !== 'roles' && tab !== 'members') return null;
  params.delete('tab');
  const rest = params.toString();
  return {
    pathname: `/corp/members/${tab === 'members' ? 'roster' : tab}`,
    search: rest ? `?${rest}` : '',
  };
}
