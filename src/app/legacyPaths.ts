const MOVES: readonly (readonly [from: string, to: string, dropParams?: readonly string[]])[] = [
  ['/wallet/loyalty', '/wallet/lp-store'],
  ['/pilot-lookup', '/travel/pilot'],
  ['/settings/shortcuts', '/help/shortcuts'],
  ['/settings/faq', '/help/faq'],
  ['/settings/help', '/help/support'],
  ['/planetary-industry/advisor', '/planetary-industry/colonies', ['system']],
  ['/skills/compare', '/skills/trained', ['groupColumn']],
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
