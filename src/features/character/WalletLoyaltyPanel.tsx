import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CachedEmptyState, DataTable, Panel, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { DataTableSort } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { LpStorePicker } from '@/features/loyalty/LpStorePicker';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

interface WalletLoyaltyPanelProps {
  activeCharacterId: number;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  loyaltyNeedsReauth: boolean;
  /** The rows to list: Ever Marks are counted on the balance panel instead. */
  otherLoyalty: CharacterLoyaltyPoints[];
  columns: DataTableColumn<CharacterLoyaltyPoints>[];
  sortProps: { sort: DataTableSort; onSortChange: (sort: DataTableSort) => void };
  tableExport: UseTableExport<CharacterLoyaltyPoints>;
}

/** The Balance tab's loyalty points list (or its one-line "none" stand-in). */
export function WalletLoyaltyPanel({
  activeCharacterId,
  loyaltyResult,
  loyaltyNeedsReauth,
  otherLoyalty,
  columns,
  sortProps,
  tableExport,
}: WalletLoyaltyPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (loyaltyResult && !loyaltyNeedsReauth && otherLoyalty.length === 0) {
    // Nothing to list: one muted line instead of an empty panel. The
    // picker stays as the way into any corp's store (issue #2321).
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-text-dim">
        <span>{t('loyalty.noneLine')}</span>
        <LpStorePicker corporationName={null} size="sm" className="w-44" />
      </div>
    );
  }
  return (
    <Panel
      // Lifts this panel's stacking context over the next one, so the
      // picker's popover isn't painted under it.
      className="relative z-10"
      padded={false}
      title={t('loyalty.title')}
      actions={
        <span className="flex items-center gap-2">
          {/* Always shown, LP or not (issue #2321): the way into any
          corp's store for a pilot who holds LP nowhere yet. */}
          <LpStorePicker corporationName={null} size="sm" className="w-44" />
          {loyaltyResult && !loyaltyNeedsReauth && otherLoyalty.length > 0 && (
            <TableActionsMenu name={t('loyalty.title')} tableExport={tableExport} />
          )}
        </span>
      }
    >
      {loyaltyNeedsReauth ? (
        <div className="p-3">
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterLoyaltyPoints']}
            title={t('loyalty.reauthTitle')}
            hint={t('loyalty.reauthHint')}
            actionLabel={t('loyalty.reauthAction')}
          />
        </div>
      ) : !loyaltyResult || otherLoyalty.length === 0 ? (
        <CachedEmptyState
          result={loyaltyResult}
          title={t('loyalty.emptyTitle')}
          hint={t('loyalty.emptyHint')}
          fetchedTitle={t('loyalty.emptyTitle')}
          className="py-8"
        />
      ) : (
        <DataTable
          {...tableExport.tableProps}
          label={t('loyalty.title')}
          columns={columns}
          rows={otherLoyalty}
          rowKey={(entry) => entry.corporation_id}
          sort={sortProps.sort}
          onSortChange={sortProps.onSortChange}
          responsive="table"
          rowClassName={() => 'group'}
          onRowClick={(entry) => navigate(`/wallet/lp-store/${entry.corporation_id}`)}
        />
      )}
    </Panel>
  );
}
