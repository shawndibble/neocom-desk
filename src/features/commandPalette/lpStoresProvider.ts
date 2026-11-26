import { rankedSearch } from '@/lib/rankedSearch';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface LpStoresProviderOptions {
  readonly loadCorporations: () => Promise<readonly LpCorporationEntry[]>;
  readonly loadBalances: () => Promise<ReadonlyMap<number, number>>;
  readonly navigate: (path: string) => void;
  readonly balanceHint: (loyaltyPoints: number) => string;
}

export const NO_BALANCES: ReadonlyMap<number, number> = new Map();

export function createLpStoresProvider({
  loadCorporations,
  loadBalances,
  navigate,
  balanceHint,
}: LpStoresProviderOptions): PaletteProvider {
  let corporations: Promise<readonly LpCorporationEntry[]> | null = null;
  let balances: Promise<ReadonlyMap<number, number>> | null = null;
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
          run: () => navigate(`/wallet/lp-store/${corp.id}`),
        };
      }
    );
  };

  return {
    id: 'lp-stores',
    labelKey: 'commandPalette.groups.lpStores',
    order: 5,
    minQueryLength: 2,
    search: (query) => {
      if (loaded) return match(query);
      corporations ??= loadCorporations().catch((error: unknown) => {
        corporations = null;
        throw error;
      });
      balances ??= loadBalances().catch(() => NO_BALANCES);
      return Promise.all([corporations, balances]).then(([corps, held]) => {
        loaded = { corps, held };
        return match(query);
      });
    },
  };
}
