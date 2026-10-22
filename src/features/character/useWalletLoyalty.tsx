import { formatCount } from '@/lib/formatCount';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, RowCaret, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useTableExport } from '@/components/ui/useTableExport';
import { useUrlSort } from '@/lib/useUrlState';
import { splitEverMarks } from '@/features/character/loyalty';
import { usePublicInfoModal } from '@/stores/publicInfoModal';
import { loyaltyPointsCsvColumns } from '@/features/character/loyaltyPointsCsv';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

const LOYALTY_SORT = { columnId: 'points', direction: 'desc' } as const;

/**
 * The Wallet Balance tab's loyalty points: the EverMarks figure split out of
 * the list, and the rest's table columns, URL sort and export.
 */
export function useWalletLoyalty(
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null,
  corporationNames: ReadonlyMap<number, string>
) {
  const { t } = useTranslation();
  const { open: openInfo } = usePublicInfoModal();
  const { everMarks, otherLoyalty } = useMemo(
    () => splitEverMarks(loyaltyResult?.data ?? []),
    [loyaltyResult]
  );

  const columns = useMemo<DataTableColumn<CharacterLoyaltyPoints>[]>(
    () => [
      {
        id: 'corporation',
        header: t('loyalty.corporation'),
        // The row navigates to the LP Store (§6c): the name is plain accent
        // text, not a link that would steal the row's click, and the caret
        // column closes the row. The ⓘ opens the corporation's Show Info
        // without leaving the Wallet, though the LP Store header carries it
        // too (docs/context/decisions/20261021-210214-wallet-lp-rows-carry-an-in-row-show.md).
        // DataTable leaves a click on a button inside the row to that button.
        render: (entry) => {
          const name = corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`;
          return (
            <span className="flex items-center gap-1">
              <span className={entityLinkClassName('min-w-0 truncate')}>{name}</span>
              <IconButton
                size="sm"
                icon={<Icon.Info />}
                label={t('loyalty.corporationInfo', { corporation: name })}
                tooltip={t('loyalty.corporationInfoShort')}
                onClick={() => openInfo('corporation', entry.corporation_id)}
              />
            </span>
          );
        },
        sortValue: (entry) =>
          corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
      },
      {
        id: 'points',
        header: t('loyalty.points'),
        align: 'right',
        className: 'tabular-nums font-semibold',
        render: (entry) => formatCount(entry.loyalty_points),
        sortValue: (entry) => entry.loyalty_points,
      },
      {
        id: 'go',
        header: '',
        align: 'right',
        render: () => <RowCaret />,
      },
    ],
    [t, corporationNames, openInfo]
  );
  const sortProps = useUrlSort(
    'loyalty.sort',
    LOYALTY_SORT,
    columns.map((column) => column.id)
  );

  const csvColumns = useMemo(
    () => loyaltyPointsCsvColumns(t, (id) => corporationNames.get(id) ?? `#${id}`),
    [t, corporationNames]
  );
  const tableExport = useTableExport({
    surface: 'loyalty-points',
    rows: otherLoyalty,
    columns: csvColumns,
  });

  return { everMarks, otherLoyalty, columns, sortProps, tableExport };
}
