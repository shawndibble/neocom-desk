import { tabPath } from '@/lib/pageTabs';
import { SHIPS_TABS } from './shipsTabs';

export const SHIPS_PATH = SHIPS_TABS.base;
export const FITTINGS_PATH = tabPath(SHIPS_TABS, 'fittings');
export const FITTING_EDIT_PATH = tabPath(SHIPS_TABS, 'fittings/edit');
export const FITTING_COMPARE_PATH = `${FITTINGS_PATH}/compare`;
export const SHIP_TREE_PATH = tabPath(SHIPS_TABS, 'tree');

export type FittingEditLocation = { pathname: string; search: string };

export function fittingEditLocation(code: string): FittingEditLocation {
  return { pathname: FITTING_EDIT_PATH, search: `?${new URLSearchParams({ f: code })}` };
}

export function fittingCompareHref(search: string): string {
  const query = search.replace(/^\?/, '');
  return query === '' ? FITTING_COMPARE_PATH : `${FITTING_COMPARE_PATH}?${query}`;
}

function hasShareCode(search: string): boolean {
  return (new URLSearchParams(search).get('f') ?? '') !== '';
}

export function fittingsRedirect(pathname: string, search: string): string | null {
  const path = pathname.replace(/\/$/, '');
  const hasCode = hasShareCode(search);
  if (path === FITTINGS_PATH && hasCode) return `${FITTING_EDIT_PATH}${search}`;
  if (path === FITTING_EDIT_PATH && !hasCode) return FITTINGS_PATH;
  return null;
}
