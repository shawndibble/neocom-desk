import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

/**
 * CSV columns for Wallet's loyalty-points-per-corporation table. `nameFor`
 * is the table's own spelling of a corporation id, so an unresolved one
 * reads the same (`#id`) in both.
 */
export function loyaltyPointsCsvColumns(
  t: CsvTranslate,
  nameFor: (corporationId: number) => string
): CsvColumn<CharacterLoyaltyPoints>[] {
  return [
    { header: t('loyalty.corporation'), value: (entry) => nameFor(entry.corporation_id) },
    { header: t('loyalty.points'), value: (entry) => entry.loyalty_points },
  ];
}
