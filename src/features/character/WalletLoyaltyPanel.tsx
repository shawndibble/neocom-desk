import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CachedEmptyState, DataTable, Panel, Spinner, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { DataTableSort } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { LpStorePicker } from '@/features/loyalty/LpStorePicker';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

/** A Character whose grant lacks the loyalty scope; `name` titles its banner. */
export interface LoyaltyReauthCharacter {
  characterId: number;
  name?: string;
}

interface WalletLoyaltyPanelProps {
  /** The picked Characters' lists, summed per corporation; null when none could be read. */
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  /** Picked Characters left out of the sum until they grant the loyalty scope again. */
  reauthCharacters: readonly LoyaltyReauthCharacter[];
  /** The picked Characters' lists are still being read. */
  loading: boolean;
  /** The rows to list: Ever Marks are counted on the balance panel instead. */
  otherLoyalty: CharacterLoyaltyPoints[];
  columns: DataTableColumn<CharacterLoyaltyPoints>[];
  sortProps: { sort: DataTableSort; onSortChange: (sort: DataTableSort) => void };
  tableExport: UseTableExport<CharacterLoyaltyPoints>;
}

/** The Balance tab's loyalty points list (or its one-line "none" stand-in). */
export function WalletLoyaltyPanel({
  loyaltyResult,
  reauthCharacters,
  loading,
  otherLoyalty,
  columns,
  sortProps,
  tableExport,
}: WalletLoyaltyPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!loading && loyaltyResult && reauthCharacters.length === 0 && otherLoyalty.length === 0) {
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
          {!loading && loyaltyResult && otherLoyalty.length > 0 && (
            <TableActionsMenu name={t('loyalty.title')} tableExport={tableExport} />
          )}
        </span>
      }
    >
      {reauthCharacters.length > 0 && (
        <div className="space-y-2 p-3">
          {reauthCharacters.map((character) => (
            <GrantBanner
              key={character.characterId}
              characterId={character.characterId}
              characterName={character.name}
              endpoints={['getCharacterLoyaltyPoints']}
              title={t('loyalty.reauthTitle')}
              hint={t('loyalty.reauthHint')}
              actionLabel={t('loyalty.reauthAction')}
            />
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !loyaltyResult || otherLoyalty.length === 0 ? (
        // A Character needing a new grant already has its banner above.
        (loyaltyResult || reauthCharacters.length === 0) && (
          <CachedEmptyState
            result={loyaltyResult}
            title={t('loyalty.emptyTitle')}
            hint={t('loyalty.emptyHint')}
            fetchedTitle={t('loyalty.emptyTitle')}
            className="py-8"
          />
        )
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
