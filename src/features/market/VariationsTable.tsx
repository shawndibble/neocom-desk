/**
 * Variations table (CONTEXT.md round 6): the selected item's Tech/Meta/
 * Faction variation group, or its Market Group siblings when the item has
 * none, sorted by Sell ascending by default so the cheapest alternative
 * leads. Clicking a row selects it, which re-anchors this table as a side
 * effect of the route's own selection state.
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { IskAmount, TypeIcon } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { priceComparison } from '@/engine/market/orderBookDepth';
import { formatIskCompact, marketIskDecimals } from '@/lib/isk';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import type { VariationRow } from './variations';
import { variationsCsvColumns } from './variationsCsv';

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Tech I/II/III rank in that order; every other meta group (Faction, Storyline, Officer, …) sorts after them, alphabetically among themselves — not plain alphabetical, which would put "Faction" ahead of "T1". */
const KNOWN_TIER_RANK: Record<string, number> = { T1: 0, T2: 1, T3: 2 };

/** `null` (a sibling-fallback row with no meta-group classification) sinks to the end like any other undefined sort value. */
function tierSortValue(tier: string | null): string | undefined {
  if (tier === null) return undefined;
  const rank = KNOWN_TIER_RANK[tier] ?? 99;
  return `${String(rank).padStart(2, '0')}${tier}`;
}

export interface VariationsTableProps {
  rows: readonly VariationRow[];
  /** Absent key = not yet requested; undefined value = still loading. */
  prices: ReadonlyMap<number, OrderBookSummary | undefined>;
  onSelect: (typeId: number) => void;
  /** Adds every row currently shown here to the Compare Set and opens the Compare drawer on Attributes — both the header button and each row's "Compare Variations" menu action. */
  onCompare: () => void;
  /** The item the rows vary, which each row's price is measured against. */
  selfName: string;
  /** Its own book at the same location the rows are priced at; `undefined` while loading. */
  selfSummary: OrderBookSummary | undefined;
  /** Where the rows are priced: the header's hub or region. */
  scopeName: string;
}

/** "+1.44M" / "−350.1K": compact, and signed so the colour never carries it alone. A signed delta string, not an IskAmount figure (exception). */
function signedCompactIsk(value: number): string {
  const text = formatIskCompact(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/**
 * Loading, then this row's own side, then the other side's presence (matches
 * the order-book tables' empty-state pair), then neither. A real price is
 * shorthand — this is a comparison board, scanned down a column — with the
 * exact figure a long press away, since the row's own tap selects the item.
 */
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
  const csvColumns = useMemo(() => variationsCsvColumns(t, prices), [t, prices]);
  const tableExport = useTableExport({ surface: 'market-variations', rows, columns: csvColumns });

  if (rows.length === 0) return null;

  function rowContextMenu(row: VariationRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name} onCompareVariations={onCompare}>
        {tr}
      </ItemContextMenu>
    );
  }

  /** A row's best sell against the item it varies. */
  const versusSelf = (row: VariationRow) =>
    priceComparison(selfSummary?.bestSell ?? null, prices.get(row.typeId)?.bestSell ?? null);

  // Sibling-fallback rows carry no meta-group classification, so the column would be all dashes.
  const hasTier = rows.some((row) => row.tier !== null);
  const columns: DataTableColumn<VariationRow>[] = [
    {
      id: 'name',
      header: t('market.variations.name'),
      sortValue: (row) => row.name,
      // The row navigates (re-anchors the page): a real link on the name,
      // a plain click is handled in place.
      // The whole row stays a pointer shortcut (onRowClick below).
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
      sortValue: (row) => versusSelf(row)?.delta,
      render: (row) => {
        const delta = versusSelf(row);
        if (delta === null) return <span className="text-text-dim">—</span>;
        return (
          // Cheaper than the item you opened reads as good news.
          <span
            className={delta.delta < 0 ? 'text-isk-pos' : delta.delta > 0 ? 'text-isk-neg' : ''}
          >
            {signedCompactIsk(delta.delta)}
          </span>
        );
      },
    },
  ];

  // Tiers group, so a twenty-row variation list reads as Tech I, Faction,
  // Officer…; a tier nobody sells here folds shut on its own (Officer
  // modules, mostly), still one click away. A sibling-fallback list has no
  // tiers and stays flat.
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
      <div className="overflow-x-auto">
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
      </div>
    </div>
  );
}
