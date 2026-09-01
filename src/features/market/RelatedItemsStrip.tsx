/**
 * Related Items strip (CONTEXT.md round 6): the selected item's Market Group
 * siblings, below the order book so a sibling's price compares directly
 * against the one on screen. Clicking a sibling selects it, which re-anchors
 * this strip as a side effect of the route's own selection state.
 */
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import type { OrderBookSummary } from '@/engine/market/orderBook';

export interface RelatedItemsStripProps {
  siblings: readonly MarketTypeEntry[];
  totalCount: number;
  truncated: boolean;
  /** Absent key = not yet requested; undefined value = still loading. */
  prices: ReadonlyMap<number, OrderBookSummary | undefined>;
  onSelect: (typeId: number) => void;
}

export function RelatedItemsStrip({
  siblings,
  totalCount,
  truncated,
  prices,
  onSelect,
}: RelatedItemsStripProps) {
  const { t } = useTranslation();

  if (siblings.length === 0) return null;

  return (
    <div className="border-t border-line px-3 py-2">
      <h2 className="pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.relatedItems.title')}
      </h2>
      {truncated && (
        <p className="pb-1 text-[0.6875rem] text-warning uppercase">
          {t('market.relatedItems.capped', { limit: siblings.length, total: totalCount })}
        </p>
      )}
      <ul aria-label={t('market.relatedItems.title')} className="flex gap-2 overflow-x-auto pb-1">
        {siblings.map((sibling) => {
          const price = prices.get(sibling.typeId);
          return (
            <li key={sibling.typeId} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(sibling.typeId)}
                className="flex max-w-[10rem] flex-col items-start gap-0.5 rounded-xs border border-line px-2 py-1.5 text-left text-xs hover:border-accent hover:text-accent"
              >
                <span className="w-full truncate text-text">{sibling.name}</span>
                <span className="tabular-nums text-text-dim">
                  {price === undefined
                    ? t('common.loading')
                    : price.bestSell !== null
                      ? formatIsk(price.bestSell, 2)
                      : price.bestBuy !== null
                        ? t('market.emptySellTitle')
                        : t('market.relatedItems.noOrders')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
