/**
 * Old paths of views that moved to a page a pilot would guess (scope decision
 * `20261002-145653-lp-store-under-market-pilot-lookup-its-own`). Each old
 * prefix maps to its new one; whatever followed the prefix — a corporation id —
 * and the query (less any retired params a move lists) and hash ride along, so
 * no bookmark or shared link breaks.
 */
const MOVES: readonly (readonly [from: string, to: string, dropParams?: readonly string[]])[] = [
  ['/wallet/loyalty', '/market/lp-store'],
  ['/travel/pilot', '/pilot-lookup'],
  ['/settings/shortcuts', '/help/shortcuts'],
  ['/settings/faq', '/help/faq'],
  ['/settings/help', '/help/support'],
  // The PI Advisor tab retired; old links land on Colonies. Its `?system` is gone, not
  // inert (scope decision `20261005-183720-retire-the-pi-advisor-accepted-feature-drops`).
  ['/planetary-industry/advisor', '/planetary-industry/colonies', ['system']],
];

export interface LegacyTarget {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

function without(search: string, keys: readonly string[]): string {
  if (keys.length === 0) return search;
  const params = new URLSearchParams(search);
  for (const key of keys) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** Where an old path lives now; an unknown path comes back unchanged. */
export function legacyLocation(pathname: string, search: string, hash: string): LegacyTarget {
  for (const [from, to, dropParams = []] of MOVES) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return {
        pathname: to + pathname.slice(from.length),
        search: without(search, dropParams),
        hash,
      };
    }
  }
  return { pathname, search, hash };
}
