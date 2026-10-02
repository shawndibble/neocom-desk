/**
 * The Command Palette's LP Stores group (#2322): NPC corporations with an LP
 * Store, from the SDE snapshot's corporation list (#2320), matched by name.
 * Selecting one opens that corporation's LP Store page.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface LpStoresProviderOptions {
  /** `loadLpCorporations`: fetched lazily on the first search, never at palette open. */
  readonly loadCorporations: () => Promise<readonly LpCorporationEntry[]>;
  /**
   * The active Character's LP per corporation id, from the already-cached
   * loyalty points — never a fresh ESI call. Read once per provider, so a
   * keystroke never re-reads it. LP cached after that first read shows from
   * the next opening (the palette remounts on every open).
   */
  readonly loadBalances: () => Promise<ReadonlyMap<number, number>>;
  readonly navigate: (path: string) => void;
  /** The trailing hint for a corp the Character holds LP with. */
  readonly balanceHint: (loyaltyPoints: number) => string;
}

/** No active Character, or nothing cached yet: every row goes without a hint. */
export const NO_BALANCES: ReadonlyMap<number, number> = new Map();

export function createLpStoresProvider({
  loadCorporations,
  loadBalances,
  navigate,
  balanceHint,
}: LpStoresProviderOptions): PaletteProvider {
  let corporations: Promise<readonly LpCorporationEntry[]> | null = null;
  let balances: Promise<ReadonlyMap<number, number>> | null = null;
  // Once both have landed, later keystrokes answer synchronously: no
  // "Searching…" flash on a list that is already in memory.
  let loaded: { corps: readonly LpCorporationEntry[]; held: ReadonlyMap<number, number> } | null =
    null;

  const match = (query: string): PaletteResult[] => {
    const { corps, held } = loaded!;
    return rankedSearch(corps, query, { primary: (corp) => corp.name, limit: GROUP_LIMIT }).map(
      (corp) => {
        const loyaltyPoints = held.get(corp.id) ?? 0;
        return {
          id: String(corp.id),
          label: corp.name,
          hint: loyaltyPoints > 0 ? balanceHint(loyaltyPoints) : undefined,
          run: () => navigate(`/market/lp-store/${corp.id}`),
        };
      }
    );
  };

  return {
    id: 'lp-stores',
    labelKey: 'commandPalette.groups.lpStores',
    // After Pages, Commands, Characters, Assets and Market Items (#2319).
    order: 5,
    minQueryLength: 2,
    search: (query) => {
      if (loaded) return match(query);
      corporations ??= loadCorporations().catch((error: unknown) => {
        corporations = null; // a failed snapshot load retries on the next keystroke
        throw error;
      });
      // A missing balance only costs the hint, never the group.
      balances ??= loadBalances().catch(() => NO_BALANCES);
      return Promise.all([corporations, balances]).then(([corps, held]) => {
        loaded = { corps, held };
        return match(query);
      });
    },
  };
}
