/**
 * An order book row's expand (`DataTable`'s `expandableRow`): what this one
 * order says that its row can't — how much of it is left, what it is worth,
 * how far it is above the best, what taking the book down to it costs — and
 * the three things a pilot does next with it: fly there, look at only that
 * station, or copy the price.
 *
 * Only facts about the order. The item's own (its required skills) are the
 * same on every row, so they sit once in the item header instead.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import {
  orderExpiry,
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { priceComparison, type DepthAt } from '@/engine/market/orderBookDepth';
import type { RegionOrder } from '@/esi/endpoints';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatVolume } from './format';
import type { MarketOrderColumnId } from './marketOrderColumns';
import { priceClipboardText } from './priceClipboardText';
import { SetDestinationButton } from './SetDestinationButton';
import { signedIsk } from './signedIsk';

export interface OrderRowDetailProps {
  order: RegionOrder;
  /** This side's best price: the cheapest sell, or the highest buy. */
  best: number | null;
  /** Units/ISK from the best order down to this one (`bookDepth`). */
  depth: DepthAt | undefined;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  /** This table's columns the pilot has hidden via the column picker — shown here instead. */
  hiddenColumns: readonly MarketOrderColumnId[];
  orderColumnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  /** Narrows the book to this order's station; `null` while it already is. */
  onFilterToStation: ((locationId: number) => void) | null;
  /** Injected for tests; `Date.now()` otherwise. */
  now?: number;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </div>
      <div className="text-text tabular-nums">{children}</div>
    </div>
  );
}

export function OrderRowDetail({
  order,
  best,
  depth,
  npcStations,
  solarSystems,
  hiddenColumns,
  orderColumnsById,
  onFilterToStation,
  now: nowProp,
}: OrderRowDetailProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // Read once when the row opens: ages and days-left don't need to tick.
  const [openedAt] = useState(() => Date.now());
  const now = nowProp ?? openedAt;
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  const placeName = location.stationName ?? t('market.unknownStructure');
  const filled = order.volume_total - order.volume_remain;
  const remainShare = order.volume_total > 0 ? order.volume_remain / order.volume_total : 0;
  const versusBest = priceComparison(best, order.price);
  const expiry = orderExpiry(order);
  const daysLeft = Math.max(0, Math.ceil((expiry.getTime() - now) / 86_400_000));
  const buy = order.is_buy_order;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-[0.6875rem] text-text-dim">
          <span>
            {t('market.orderDetail.remaining', {
              remain: formatVolume(order.volume_remain),
              total: formatVolume(order.volume_total),
            })}
            {filled > 0 &&
              ` · ${t('market.orderDetail.filled', { count: filled, units: formatVolume(filled) })}`}
          </span>
          <span>
            {t('market.orderDetail.issued', {
              age: formatAge(Math.max(0, now - new Date(order.issued).getTime()), t),
            })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('market.orderDetail.remainingLabel')}
          aria-valuemin={0}
          aria-valuemax={order.volume_total}
          aria-valuenow={order.volume_remain}
          className="h-1 bg-line"
        >
          <div className="h-1 bg-accent" style={{ width: `${Math.round(remainShare * 100)}%` }} />
        </div>
      </div>

      <p className="text-text">
        <span className="font-semibold">{placeName}</span>
        {location.systemName !== '' && (
          <span className="text-text-dim"> · {location.systemName}</span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Fact label={t('market.orderDetail.orderValue')}>
          {formatIskCompact(order.price * order.volume_remain)}
        </Fact>
        <Fact label={t('market.orderDetail.versusBest')}>
          {versusBest === null || versusBest.delta === 0
            ? t('market.orderDetail.isBest')
            : `${signedIsk(versusBest.delta, 2)} (${versusBest.ratio > 0 ? '+' : '−'}${Math.abs(
                versusBest.ratio * 100
              ).toFixed(2)}%)`}
        </Fact>
        <Fact label={t('market.expiry')}>
          {expiry.toLocaleDateString()}{' '}
          <span className="text-text-dim">
            · {t('market.orderDetail.daysLeft', { count: daysLeft })}
          </span>
        </Fact>
        {buy && <Fact label={t('market.minVolume')}>{formatVolume(order.min_volume)}</Fact>}
        {location.stationName === null && (
          <Fact label={t('market.orderDetail.structureType')}>
            {t('market.orderDetail.playerStructure')}
          </Fact>
        )}
        {hiddenColumns.map((id) => {
          const column = orderColumnsById[id];
          return (
            <Fact key={id} label={column.header}>
              {column.render(order)}
            </Fact>
          );
        })}
      </div>

      {depth && (
        <p className="border border-line bg-bg px-2 py-1.5">
          <span className="text-text-dim">
            {t(buy ? 'market.orderDetail.sellDownTo' : 'market.orderDetail.buyDownTo')}
          </span>{' '}
          <span className="font-semibold tabular-nums">
            {t('market.orderDetail.depthUnits', {
              units: formatVolume(depth.units),
              isk: formatIskCompact(depth.isk),
            })}
          </span>{' '}
          <span className="text-text-dim tabular-nums">
            ·{' '}
            {t('market.orderDetail.depthAverage', { price: formatIsk(depth.isk / depth.units, 2) })}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SetDestinationButton locationId={order.location_id} placeName={placeName} />
        {onFilterToStation && (
          <Button size="sm" onClick={() => onFilterToStation(order.location_id)}>
            {t('market.orderDetail.onlyThisStation')}
          </Button>
        )}
        <Button
          size="sm"
          aria-label={t('market.orderDetail.copyPriceOf', { price: formatIsk(order.price, 2) })}
          onClick={() => {
            void writeToClipboard(priceClipboardText(order.price)).then(() => setCopied(true));
          }}
        >
          {t('market.contextMenu.copyPrice')}
        </Button>
        {copied && (
          <span role="status" className="text-xs text-success">
            {t('market.orderDetail.copied')}
          </span>
        )}
      </div>
    </div>
  );
}
