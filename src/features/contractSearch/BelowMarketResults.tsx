/**
 * Contracts › Item search with "Below market" on (#3989): one row per public
 * contract worth more than it asks — Value · Asking · Profit · Jumps, best
 * Profit first. The valuation is `engine/contracts/belowMarket.ts`; the
 * prices come from `belowMarketData.ts`. The panel owns the filters and hands
 * over only the contracts that pass them.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  IskAmount,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { BelowMarketContract } from '@/engine/contracts/belowMarket';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { BelowMarketState } from '@/features/contractSearch/belowMarketData';
import { belowMarketItemLabel } from '@/features/contractSearch/belowMarketSummary';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { JumpsCellValue } from '@/features/route/currentSystem';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import { formatAge } from '@/lib/age';
import { useNow } from '@/lib/useNow';
import { useUrlSort } from '@/lib/useUrlState';

const SORT = { columnId: 'profit', direction: 'desc' } as const;

interface BelowMarketResultsProps {
  state: BelowMarketState;
  /** The contracts that pass the bar's filters; `state`'s own list is unfiltered. */
  contracts: readonly BelowMarketContract[];
  /** ms since epoch of the contract snapshot behind the valuation. */
  lastSyncedAt: number | null;
  typeNames: ReadonlyMap<number, string>;
  offerLocations: ReadonlyMap<number, OfferLocation>;
  offerJumps: (row: PublicContractOfferRow) => JumpsCellValue;
  onOpen: (row: PublicContractOfferRow) => void;
  /** Resets the bar's filters, offered when they leave nothing. */
  onResetFilters: () => void;
}

export function BelowMarketResults({
  state,
  contracts,
  lastSyncedAt,
  typeNames,
  offerLocations,
  offerJumps,
  onOpen,
  onResetFilters,
}: BelowMarketResultsProps) {
  const { t } = useTranslation();
  const now = useNow();

  const columns = useMemo<DataTableColumn<BelowMarketContract>[]>(
    () => [
      {
        id: 'item',
        header: t('contractSearch.itemColumn'),
        primary: true,
        sortValue: (row) => belowMarketItemLabel(row.lead, typeNames, t),
        render: (row) => (
          // Span, not a Link: the row opens the contract modal, whose lines link to Market.
          <span>
            <span className={entityLinkClassName()}>
              {belowMarketItemLabel(row.lead, typeNames, t)}
            </span>
            {row.lines > 1 && (
              <span className="text-text-dim">
                {' '}
                {t('contractSearch.belowMarket.more', { count: row.lines - 1 })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'value',
        header: t('contractSearch.belowMarket.valueColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.value,
        stackAffix: { before: t('contractSearch.belowMarket.valueAffix') },
        render: (row) => (
          <>
            <IskAmount value={row.value} decimals={0} />
            <span className="ml-1 text-[0.625rem] text-text-dim sm:ml-0 sm:block">
              {row.source.kind === 'market'
                ? t('contractSearch.belowMarket.sourceMarket')
                : t('contractSearch.belowMarket.sourceOffers', { count: row.source.offerCount })}
            </span>
          </>
        ),
      },
      {
        id: 'asking',
        header: t('contractSearch.belowMarket.askingColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.asking,
        stackAffix: { before: t('contractSearch.belowMarket.askingAffix') },
        render: (row) => <IskAmount value={row.asking} decimals={0} />,
      },
      {
        id: 'profit',
        header: t('contractSearch.belowMarket.profitColumn'),
        align: 'right',
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap text-isk-pos',
        sortValue: (row) => row.profit,
        render: (row) => (
          <>
            +<IskAmount value={row.profit} decimals={0} />
          </>
        ),
      },
      {
        id: 'system',
        header: t('contractSearch.systemColumn'),
        className: 'whitespace-nowrap',
        sortValue: (row) => offerLocations.get(row.lead.locationId)?.systemName ?? undefined,
        render: (row) => {
          const location = offerLocations.get(row.lead.locationId);
          if (location === undefined) return <span className="text-text-dim">…</span>;
          if (location.systemName === null) return <span className="text-text-dim">—</span>;
          return (
            <>
              <span>{location.systemName}</span>
              {location.security !== null && (
                <>
                  {' '}
                  <SecurityStatus security={location.security} />
                </>
              )}
            </>
          );
        },
      },
      {
        id: 'jumps',
        header: t('contractSearch.itemsJumpsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => {
          const cell = offerJumps(row.lead);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        stackAffix: { before: t('contractSearch.mobile.jumpsAffix') },
        render: (row) =>
          renderJumpsCell(
            offerJumps(row.lead),
            t,
            'contractSearch.jumpsUnavailableHint',
            offerLocations.get(row.lead.locationId)?.systemId
          ),
      },
    ],
    [t, typeNames, offerLocations, offerJumps]
  );
  const sortProps = useUrlSort(
    'items.bmSort',
    SORT,
    columns.map((column) => column.id)
  );

  const hubName = state.status === 'ready' ? state.hub.systemName : null;
  /** Contracts exist; the bar's filters leave none. */
  const filteredOut = state.status === 'ready' && state.contracts.length > 0;
  // The header's Data Age badge is hidden on a phone; this line is not.
  const note =
    lastSyncedAt === null
      ? null
      : t('contractSearch.belowMarket.note', {
          age: formatAge(Math.max(0, now - lastSyncedAt), t),
          hub: hubName ?? '…',
        });

  return (
    <>
      {note !== null && (
        <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
          {note}
          {state.status === 'ready' && state.unreachable && (
            <> · {t('contractSearch.belowMarket.pricesUnreachable')}</>
          )}
        </p>
      )}
      {state.status === 'idle' || state.status === 'pricing' ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('contractSearch.belowMarket.pricing')} />
        </div>
      ) : state.status === 'failed' ? (
        <EmptyState
          title={t('contractSearch.belowMarket.failedTitle')}
          hint={t('contractSearch.belowMarket.failedHint')}
          className="py-8"
        />
      ) : contracts.length === 0 ? (
        <EmptyState
          title={t('contractSearch.belowMarket.emptyTitle')}
          hint={t(
            filteredOut
              ? 'contractSearch.noFilterMatchesHint'
              : 'contractSearch.belowMarket.emptyHint'
          )}
          className="py-8"
          action={
            filteredOut ? (
              <Button size="sm" onClick={onResetFilters}>
                {t('common.resetFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          label={t('contractSearch.belowMarket.tableLabel')}
          columns={columns}
          rows={contracts}
          rowKey={(row) => row.contractId}
          {...sortProps}
          stackLayout="dense"
          mobileSort
          stackSummary={t('contractSearch.belowMarket.count', { count: contracts.length })}
          onRowClick={(row) => onOpen(row.lead)}
          virtualize
        />
      )}
    </>
  );
}
