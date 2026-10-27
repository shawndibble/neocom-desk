import type { ScopeGroup } from '@/esi/registry';
import { tabPath } from '@/lib/pageTabs';
import { SETTINGS_TABS } from './pageTabs';

/** Settings › Permissions, with `groups`' Grant buttons flagged to flash (`PermissionsPanel`). */
export function grantMissingPath(groups: readonly ScopeGroup[]): string {
  const base = tabPath(SETTINGS_TABS, 'permissions');
  return groups.length === 0 ? base : `${base}?grant=${groups.join(',')}`;
}
