import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';
import { PARAGON_CORPORATION_ID } from './loyalty';

/**
 * CSV columns for Wallet's loyalty-points-per-corporation table. `nameFor`
 * is the table's own spelling of a corporation id, so an unresolved one
 * reads the same (`#id`) in both. The Paragon entry is the EverMarks figure
 * the table lifts into the balance box; the file lists it as a row, named
 * EverMarks, so no loyalty balance is left out.
 */
export function loyaltyPointsCsvColumns(
  t: CsvTranslate,
  nameFor: (corporationId: number) => string
): CsvColumn<CharacterLoyaltyPoints>[] {
  return [
    {
      header: t('loyalty.corporation'),
      value: (entry) =>
        entry.corporation_id === PARAGON_CORPORATION_ID
          ? t('wallet.everMarks')
          : nameFor(entry.corporation_id),
    },
    { header: t('loyalty.points'), value: (entry) => entry.loyalty_points },
  ];
}
