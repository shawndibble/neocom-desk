/**
 * The Compare drawer's Trade hubs view (issue #4697, mockup #4696): items down
 * the side, the five Trade Hubs across, each cell the hub station's best sell
 * over its best buy. A table at every width, like Prices.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { formatMarketIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { MarketItemLink } from './MarketItemLink';
import { RemovableTypeIcon } from './RemovableTypeIcon';
import type { CompareHubRow } from './compareHubsRows';
import type { HubId } from './useCompareHubs';

/** A best figure carries the word, not just the colour. */
function BestTag({ children }: { children: string }) {
  return (
    <span className="ml-1.5 text-[0.625rem] font-semibold tracking-wide text-success uppercase">
      {children}
    </span>
  );
}

function TradeHubCell({ row, hub }: { row: CompareHubRow; hub: TradeHub }) {
  const { t } = useTranslation();
  const quote = row.quotes[hub.id];
  if (quote.loading) return <span className="text-text-dim">…</span>;
  if (row.unreachable[hub.id]) return <span className="text-text-dim">—</span>;
  const isBestSell = row.bestSellHub === hub.id;
  const isBestBuy = row.bestBuyHub === hub.id;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums">
      <span className="whitespace-nowrap">
        {quote.sell === null ? (
          <span className="text-text-dim">{t('market.compare.noSellers')}</span>
        ) : (
          <MarketItemLink
            typeId={row.typeId}
            hubId={hub.id}
            aria-label={t('market.compare.hubCellLabel', {
              item: row.itemName,
              hub: hub.systemName,
              price: formatMarketIsk(quote.sell),
            })}
            className={cx(inlineLinkClassName, isBestSell && 'text-success')}
          >
            {formatMarketIsk(quote.sell)}
          </MarketItemLink>
        )}
        {isBestSell && <BestTag>{t('market.compare.lowest')}</BestTag>}
      </span>
      <span className="text-[0.6875rem] whitespace-nowrap text-text-dim">
        {t('market.compare.buyLine', {
          price: quote.buy === null ? '—' : formatMarketIsk(quote.buy),
        })}
        {isBestBuy && <BestTag>{t('market.compare.highest')}</BestTag>}
      </span>
    </span>
  );
}

export interface TradeHubsTableProps {
  rows: CompareHubRow[];
  jumps: Readonly<Record<HubId, number | null>>;
  /** The pilot's saved Market hub, marked in its column header. */
  ownHub: HubId;
  tableExport: UseTableExport<CompareHubRow>;
  onRemove: (typeId: number) => void;
}

export function TradeHubsTable({
  rows,
  jumps,
  ownHub,
  tableExport,
  onRemove,
}: TradeHubsTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<CompareHubRow>[]>(
    () => [
      {
        id: 'item',
        header: t('market.compare.columnItem'),
        stickyStart: true,
        sortValue: (row) => row.itemName,
        render: (row) => (
          <span className="flex items-center gap-2.5">
            <RemovableTypeIcon
              typeId={row.typeId}
              itemName={row.itemName}
              onRemove={onRemove}
              sizeClassName="size-6"
            />
            <MarketItemLink typeId={row.typeId}>{row.itemName}</MarketItemLink>
          </span>
        ),
      },
      ...TRADE_HUBS.map((hub): DataTableColumn<CompareHubRow> => {
        const count = jumps[hub.id];
        const isOwn = hub.id === ownHub;
        const tooltip = [
          count === null ? null : t('market.compare.hubJumpsFromYou', { count }),
          isOwn ? t('market.compare.hubYourMarketHub') : null,
        ].filter(Boolean);
        return {
          id: hub.id,
          header:
            count === null
              ? hub.systemName
              : t('market.compare.hubHeader', { hub: hub.systemName, jumps: count }),
          headerTooltip: tooltip.length > 0 ? tooltip.join(' · ') : undefined,
          headerClassName: isOwn ? 'text-accent' : undefined,
          align: 'right',
          render: (row) => <TradeHubCell row={row} hub={hub} />,
          sortFirst: 'asc',
          sortValue: (row) => row.quotes[hub.id].sell ?? undefined,
        };
      }),
    ],
    [t, jumps, ownHub, onRemove]
  );
  return (
    <DataTable
      {...tableExport.tableProps}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.typeId}
      label={t('market.compare.hubsTableLabel')}
      // A compare table at every width, as Prices: sideways scroll, item pinned.
      responsive="table"
    />
  );
}
