import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterWalletBalance } from './wallet';

/**
 * CSV columns for Wallet's balance-by-character table: the character, then
 * the balance as a raw number. A balance the table can't show (re-auth
 * needed, never loaded) is blank rather than 0 — a 0 would sum as if the
 * character were broke.
 */
export function walletBalancesCsvColumns(t: CsvTranslate): CsvColumn<CharacterWalletBalance>[] {
  return [
    { header: t('wallet.balanceCharacterColumn'), value: (row) => row.characterName },
    {
      header: t('wallet.isk'),
      value: (row) => (row.needsReauth ? null : (row.balanceResult?.data ?? null)),
    },
  ];
}
