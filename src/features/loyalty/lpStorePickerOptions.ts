/**
 * The LP Store picker's option list (issue #2321): every NPC corporation that
 * runs an LP Store (`lpCorporations.json`, #2320), with the ones the active
 * Character holds LP with pinned first — highest balance first, carrying
 * that balance — and the rest alphabetically. A typed query filters both
 * groups; held corps stay pinned above the others either way.
 *
 * Only corps in the snapshot are offered: a balance with a corp that runs no
 * store (Paragon's EverMarks) has nothing to open.
 */
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { rankedSearch } from '@/lib/rankedSearch';

export interface LpStorePickerOption {
  corporationId: number;
  name: string;
  /** The active Character's LP with this corp; `null` when they hold none. */
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
