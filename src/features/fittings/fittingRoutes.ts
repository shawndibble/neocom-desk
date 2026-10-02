/**
 * The Ships section's own paths (scope decision `20260926-135538`). The
 * Fittings Start screen (the library: hulls, Load, My and In-game Fittings)
 * is `/ships/fittings`; an open Fitting is `/ships/fittings/edit?f=<Share
 * Link code>`, so opening one is a history entry Back can return from.
 *
 * The section was `/fittings` until it became Ships, and every Fitting Share Code
 * ever copied is `/fittings?f=` — `legacyShipsLocation` keeps each old path
 * landing where it always did.
 */
import { tabPath } from '@/lib/pageTabs';
import { SHIPS_TABS } from './shipsTabs';

export const SHIPS_PATH = SHIPS_TABS.base;
export const FITTINGS_PATH = tabPath(SHIPS_TABS, 'fittings');
export const FITTING_EDIT_PATH = tabPath(SHIPS_TABS, 'fittings/edit');
export const FITTING_COMPARE_PATH = `${FITTINGS_PATH}/compare`;
export const SHIP_TREE_PATH = tabPath(SHIPS_TABS, 'tree');

/** The editor's location for a Fitting Share Code. */
export function fittingEditLocation(code: string): { pathname: string; search: string } {
  return { pathname: FITTING_EDIT_PATH, search: `?${new URLSearchParams({ f: code })}` };
}

/** Compare's href for a query string (`f=…&f=…`, with or without its `?`). */
export function fittingCompareHref(search: string): string {
  const query = search.replace(/^\?/, '');
  return query === '' ? FITTING_COMPARE_PATH : `${FITTING_COMPARE_PATH}?${query}`;
}

function hasShareCode(search: string): boolean {
  return (new URLSearchParams(search).get('f') ?? '') !== '';
}

/**
 * Where the Fittings tab sends a visitor, or null to stay put. A Fitting Share Code
 * on the library's own path opens the editor; the editor's path with no
 * Fitting is just the library.
 */
export function fittingsRedirect(pathname: string, search: string): string | null {
  const path = pathname.replace(/\/$/, '');
  const hasCode = hasShareCode(search);
  if (path === FITTINGS_PATH && hasCode) return `${FITTING_EDIT_PATH}${search}`;
  if (path === FITTING_EDIT_PATH && !hasCode) return FITTINGS_PATH;
  return null;
}

/**
 * Where an old path lands now, query and hash kept: `/fittings` (and any
 * other path below it) on the Fittings tab — the editor straight away when
 * it carries a Fitting Share Code, so an old link is one redirect, not two —
 * `/fittings/compare` on Compare, and `/skills/ships` on the Ship Tree.
 */
export function legacyShipsLocation(
  pathname: string,
  search: string,
  hash: string
): { pathname: string; search: string; hash: string } {
  const path = pathname.replace(/\/$/, '');
  const target =
    path === '/skills/ships'
      ? SHIP_TREE_PATH
      : path === '/fittings/compare'
        ? FITTING_COMPARE_PATH
        : hasShareCode(search)
          ? FITTING_EDIT_PATH
          : FITTINGS_PATH;
  return { pathname: target, search, hash };
}
