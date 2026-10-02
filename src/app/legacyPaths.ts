/**
 * Old paths of views that moved to a page a pilot would guess (scope decision
 * `20261002-145653-lp-store-under-market-pilot-lookup-its-own`). Each old
 * prefix maps to its new one; whatever followed the prefix — a corporation id —
 * and the query and hash ride along, so no bookmark or shared link breaks.
 */
const MOVES: readonly (readonly [from: string, to: string])[] = [
  ['/wallet/loyalty', '/market/lp-store'],
  ['/travel/pilot', '/pilot-lookup'],
  ['/settings/faq', '/help/faq'],
  ['/settings/help', '/help/support'],
];

export interface LegacyTarget {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

/** Where an old path lives now; an unknown path comes back unchanged. */
export function legacyLocation(pathname: string, search: string, hash: string): LegacyTarget {
  for (const [from, to] of MOVES) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return { pathname: to + pathname.slice(from.length), search, hash };
    }
  }
  return { pathname, search, hash };
}
