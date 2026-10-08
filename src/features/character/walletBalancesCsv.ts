import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { LAYER_IDS, netWorthOf, type LayerId } from '@/engine/netWorth/series';
import type { NetWorthTableRow } from '@/features/netWorth/tableRows';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';

/**
 * CSV columns for Wallet's balance-by-character table: the character, one
 * column per layer, then the net worth of the layers shown. A Character the
 * table can't total (missing permission, re-auth needed) is blank rather than
 * 0 — a 0 would sum as if the character were broke.
 */
export function walletBalancesCsvColumns(
  t: CsvTranslate,
  shown: readonly LayerId[] = LAYER_IDS
): CsvColumn<NetWorthTableRow>[] {
  return [
    { header: t('wallet.balanceCharacterColumn'), value: (row) => row.characterName },
    ...LAYER_IDS.map((id) => ({
      header: t(LAYER_LABEL_KEYS[id]),
      value: (row: NetWorthTableRow) =>
        row.needsReauth && id === 'isk' ? null : (row.layers?.[id] ?? null),
    })),
    {
      header: t('wallet.netWorth.total'),
      value: (row) => (row.layers && !row.needsReauth ? netWorthOf(row.layers, shown) : null),
    },
  ];
}
