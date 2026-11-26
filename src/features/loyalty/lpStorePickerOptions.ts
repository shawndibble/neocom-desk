import type { CharacterLoyaltyPoints } from '@/esi/endpoints';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { rankedSearch } from '@/lib/rankedSearch';

export interface LpStorePickerOption {
  corporationId: number;
  name: string;
  lp: number | null;
}

export function lpStorePickerOptions(
  corporations: readonly LpCorporationEntry[],
  balances: readonly Pick<CharacterLoyaltyPoints, 'corporation_id' | 'loyalty_points'>[],
  query: string
): LpStorePickerOption[] {
  const lpById = new Map<number, number>();
  for (const entry of balances) {
    if (entry.loyalty_points > 0) lpById.set(entry.corporation_id, entry.loyalty_points);
  }

  const q = query.trim();
  const matched =
    q === ''
      ? [...corporations].sort((a, b) => a.name.localeCompare(b.name))
      : rankedSearch(corporations, q, {
          primary: (corp) => corp.name,
          limit: corporations.length,
        });

  const held: LpStorePickerOption[] = [];
  const rest: LpStorePickerOption[] = [];
  for (const corp of matched) {
    const lp = lpById.get(corp.id) ?? null;
    (lp === null ? rest : held).push({ corporationId: corp.id, name: corp.name, lp });
  }
  held.sort((a, b) => (b.lp ?? 0) - (a.lp ?? 0));
  return [...held, ...rest];
}
