/**
 * Variations table (CONTEXT.md round 6): the selected item's Tech/Meta/
 * Faction variation group, or its Market Group siblings when the item has
 * none, sorted by Sell ascending by default so the cheapest alternative
 * leads. Clicking a row selects it, which re-anchors this table as a side
 * effect of the route's own selection state.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { formatIsk } from '@/lib/isk';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { ItemContextMenu } from './ItemContextMenu';
import type { VariationRow } from './variations';

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface VariationsTableProps {
  rows: readonly VariationRow[];
  totalCount: number;
  truncated: boolean;
  /** Absent key = not yet requested; undefined value = still loading. */
  prices: ReadonlyMap<number, OrderBookSummary | undefined>;
  onSelect: (typeId: number) => void;
  /** Opens the attribute-compare modal for every row currently shown here — both the header button and each row's "Compare Variations" menu action. */
  onCompare: () => void;
  /** Same per-item context menu as the tree (issue #147): null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

/** Loading, then this row's own side, then the other side's presence (matches the order-book tables' empty-state pair), then neither. */
function priceCellText(
  summary: OrderBookSummary | undefined,
  side: 'sell' | 'buy',
  t: Translate
): string {
  if (summary === undefined) return t('common.loading');
  const own = side === 'sell' ? summary.bestSell : summary.bestBuy;
  if (own !== null) return formatIsk(own, 2);
  const other = side === 'sell' ? summary.bestBuy : summary.bestSell;
  if (other !== null) return t(side === 'sell' ? 'market.emptySellTitle' : 'market.emptyBuyTitle');
  return t('market.variations.noOrders');
}

export function VariationsTable({
  rows,
  totalCount,
  truncated,
  prices,
  onSelect,
  onCompare,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: VariationsTableProps) {
  const { t } = useTranslation();

  if (rows.length === 0) return null;

  function rowContextMenu(row: VariationRow, tr: ReactElement) {
    const blueprintTypeID =
      blueprintCatalog === null
        ? undefined
        : (blueprintCatalog.byProductTypeID.get(row.typeId)?.blueprintTypeID ?? null);
    return (
      <ItemContextMenu
        typeId={row.typeId}
        itemName={row.name}
        blueprintTypeID={blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onCompareVariations={onCompare}
        onOpenChange={(open) => {
          if (open) onRequestBlueprintCatalog();
        }}
      >
        {tr}
      </ItemContextMenu>
    );
  }

  const columns: DataTableColumn<VariationRow>[] = [
    {
      id: 'name',
      header: t('market.variations.name'),
      sortValue: (row) => row.name,
      // The whole row is the click target (onRowClick below) — identical to
      // the old card strip, where clicking anywhere on a card re-anchored
      // the page, not just its name.
      render: (row) => (
        <span className="font-medium text-accent">
          {row.name}
          <span aria-hidden="true"> ›</span>
        </span>
      ),
    },
    {
      id: 'tier',
      header: t('market.variations.tier'),
      className: 'text-text-dim',
      render: (row) => row.tier ?? '—',
    },
    {
      id: 'sell',
      header: t('market.variations.sell'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => prices.get(row.typeId)?.bestSell ?? undefined,
      render: (row) => priceCellText(prices.get(row.typeId), 'sell', t),
    },
    {
      id: 'buy',
      header: t('market.variations.buy'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => prices.get(row.typeId)?.bestBuy ?? undefined,
      render: (row) => priceCellText(prices.get(row.typeId), 'buy', t),
    },
  ];

  return (
    <div className="border-t border-line px-3 py-2">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('market.variations.title')}
        </h2>
        <Button size="sm" onClick={onCompare}>
          {t('market.variations.compare')}
        </Button>
      </div>
      {truncated && (
        <p className="pb-1 text-[0.6875rem] text-warning uppercase">
          {t('market.variations.capped', { limit: rows.length, total: totalCount })}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.typeId}
        label={t('market.variations.title')}
        defaultSort={{ columnId: 'sell', direction: 'asc' }}
        density="compact"
        onRowClick={(row) => onSelect(row.typeId)}
        rowContextMenu={rowContextMenu}
      />
    </div>
  );
}
