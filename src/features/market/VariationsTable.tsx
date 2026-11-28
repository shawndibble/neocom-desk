import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { IskAmount, TypeIcon } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { formatIskCompact, marketIskDecimals } from '@/lib/isk';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import { versusSelf, type VariationRow } from './variations';
import { variationsCsvColumns } from './variationsCsv';
import type { Translate } from '@/lib/translate';
import { TableScroll } from '@/components/ui/TableScroll';

const KNOWN_TIER_RANK: Record<string, number> = { T1: 0, T2: 1, T3: 2 };

function tierSortValue(tier: string | null): string | undefined {
  if (tier === null) return undefined;
  const rank = KNOWN_TIER_RANK[tier] ?? 99;
  return `${String(rank).padStart(2, '0')}${tier}`;
}

export interface VariationsTableProps {
  rows: readonly VariationRow[];
  prices: ReadonlyMap<number, OrderBookSummary | undefined>;
  onSelect: (typeId: number) => void;
  onCompare: () => void;
  selfName: string;
  selfSummary: OrderBookSummary | undefined;
  scopeName: string;
}

function signedCompactIsk(value: number): string {
  const text = formatIskCompact(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function priceCell(
  summary: OrderBookSummary | undefined,
  side: 'sell' | 'buy',
  t: Translate
): ReactNode {
  if (summary === undefined) return t('common.loading');
  const own = side === 'sell' ? summary.bestSell : summary.bestBuy;
  if (own !== null) return <IskAmount value={own} decimals={marketIskDecimals(own)} />;
  const other = side === 'sell' ? summary.bestBuy : summary.bestSell;
  if (other !== null) return t(side === 'sell' ? 'market.emptySellTitle' : 'market.emptyBuyTitle');
  return t('market.variations.noOrders');
}

export function VariationsTable({
  rows,
  prices,
  onSelect,
  onCompare,
  selfName,
  selfSummary,
  scopeName,
}: VariationsTableProps) {
  const { t } = useTranslation();
  const csvColumns = useMemo(
    () => variationsCsvColumns(t, prices, { selfName, selfSummary, scopeName }),
    [t, prices, selfName, selfSummary, scopeName]
  );
  const tableExport = useTableExport({ surface: 'market-variations', rows, columns: csvColumns });

  if (rows.length === 0) return null;

  function rowContextMenu(row: VariationRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name} onCompareVariations={onCompare}>
        {tr}
      </ItemContextMenu>
    );
  }

  const hasTier = rows.some((row) => row.tier !== null);
  const columns: DataTableColumn<VariationRow>[] = [
    {
      id: 'name',
      header: t('market.variations.name'),
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="flex items-center gap-1.5 font-medium">
          <TypeIcon typeId={row.typeId} size={32} className="h-4 w-4 shrink-0" />
          <MarketItemLink
            typeId={row.typeId}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onSelect(row.typeId);
            }}
          >
            {row.name}
          </MarketItemLink>
        </span>
      ),
    },
    ...(hasTier
      ? [
          {
            id: 'tier',
            header: t('market.variations.tier'),
            className: 'text-text-dim',
            sortFirst: 'asc' as const,
            sortValue: (row: VariationRow) => tierSortValue(row.tier),
            render: (row: VariationRow) => row.tier ?? '—',
          },
        ]
      : []),
    {
      id: 'sell',
      header: t('market.variations.sell'),
      align: 'right',
      className: 'tabular-nums',
      sortFirst: 'asc' as const,
      sortValue: (row) => prices.get(row.typeId)?.bestSell ?? undefined,
      render: (row) => priceCell(prices.get(row.typeId), 'sell', t),
    },
    {
      id: 'buy',
      header: t('market.variations.buy'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => prices.get(row.typeId)?.bestBuy ?? undefined,
      render: (row) => priceCell(prices.get(row.typeId), 'buy', t),
    },
    {
      id: 'delta',
      header: t('market.variations.versus', { name: selfName }),
      headerTooltip: t('market.variations.versusHint', { name: selfName }),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => versusSelf(selfSummary, prices, row.typeId)?.delta,
      render: (row) => {
        const delta = versusSelf(selfSummary, prices, row.typeId);
        if (delta === null) return <span className="text-text-dim">—</span>;
        return (
          <span
            className={delta.delta < 0 ? 'text-isk-pos' : delta.delta > 0 ? 'text-isk-neg' : ''}
          >
            {signedCompactIsk(delta.delta)}
          </span>
        );
      },
    },
  ];

  const hasSellOrders = (group: readonly VariationRow[]) =>
    group.some((row) => {
      const summary = prices.get(row.typeId);
      return summary === undefined || summary.bestSell !== null;
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h2 className="m-0 text-xs font-semibold tracking-widest uppercase">
            {t('market.variations.title')}
          </h2>
          <span className="text-xs text-text-dim">
            {t('market.variations.pricedAt', { scope: scopeName })}
          </span>
        </div>
        <span className="flex items-center gap-2">
          <TableActionsMenu name={t('market.variations.title')} tableExport={tableExport} />
          <Button size="sm" onClick={onCompare}>
            {t('market.variations.compare')}
          </Button>
        </span>
      </div>
      <p className="m-0 flex flex-wrap items-baseline gap-x-3 border border-accent-dim bg-panel-2 px-3 py-1.5 text-xs">
        <span className="font-semibold">{selfName}</span>
        <span className="text-[0.6875rem] text-accent uppercase">
          {t('market.variations.thisItem')}
        </span>
        <span className="tabular-nums">
          {t('market.variations.sell')} {priceCell(selfSummary, 'sell', t)}
        </span>
        <span className="text-text-dim tabular-nums">
          {t('market.variations.buy')} {priceCell(selfSummary, 'buy', t)}
        </span>
      </p>
      <TableScroll>
        <DataTable
          {...tableExport.tableProps}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.typeId}
          label={t('market.variations.title')}
          defaultSort={{ columnId: 'sell', direction: 'asc' }}
          density="compact"
          onRowClick={(row) => onSelect(row.typeId)}
          rowContextMenu={rowContextMenu}
          rowMoreActions
          mobileSort
          groupBy={
            hasTier
              ? {
                  key: (row) => row.tier,
                  allWidths: true,
                  defaultExpanded: hasSellOrders,
                  renderHeader: (group) => (
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[0.6875rem] font-semibold tracking-widest uppercase">
                        {group[0]?.tier}
                      </span>
                      <span className="text-xs text-text-dim">
                        {hasSellOrders(group)
                          ? t('market.variations.groupCount', { count: group.length })
                          : t('market.variations.groupNoneSold', {
                              count: group.length,
                              scope: scopeName,
                            })}
                      </span>
                    </span>
                  ),
                }
              : undefined
          }
        />
      </TableScroll>
    </div>
  );
}
