import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { LAYER_IDS, netWorthOf, type LayerId } from '@/engine/netWorth/series';
import type { NetWorthTableRow } from '@/features/netWorth/tableRows';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';

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
