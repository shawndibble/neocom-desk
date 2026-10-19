/**
 * Full breakdown of one open order (GLOSSARY.md's redesigned Market > Open
 * Orders tab): what to do about it, the numbers behind that call, who is
 * cheaper and where, and — for a sell order — the cost-basis ledger the
 * floor came from.
 *
 * `OrderDetailModal` takes the order, the page snapshot and the page's one
 * Order Detail (`useOrderDetail`), which owns every fetch behind it;
 * `useOpenOrderDetail` asks for what this order needs and assembles the
 * view (`orderDetailView.ts`). `OrderDetailContent` below only renders that
 * finished view and asks for more via `onCheckDeeper`.
 *
 * The station/system/region three-way state a caller must not collapse:
 * - Station is always eager (`stationChecked` false only means the Fuzzwork
 *   aggregate call itself failed for this station — genuinely rare).
 * - System and region come from `deep`, fetched on demand. `deep === null`
 *   means "not checked yet" for BOTH; once it has run, `'system' in
 *   deep`'s undercut result can still be absent — my own order's system id
 *   could not be recovered from the region book (`openOrdersModel.ts`'s
 *   `deriveSystemId`) — which must render as "not checked" too, never as
 *   "checked, clean".
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StatChip, StatChips } from '@/components/ui';
import { formatMarketIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import type { OpenOrderRow } from './openOrdersModel';
import { adviseOrder } from './orderAdvice';
import { useOpenOrderDetail, type OrderDetail } from './useOrderDetail';
import { verdictFigures, type OrderDetailSnapshot, type OrderDetailView } from './orderDetailView';
import { CopyPriceButton } from './CopyablePrice';
import {
  deepScopeState,
  stationScopeState,
  structureStationScopeState,
  computeSellThrough,
  type LocationState,
} from './orderScopeState';
import { IskDelta } from '@/components/ui/IskDelta';
import { OrderDetailHeader } from './OrderDetailHeader';
import { OrderWhoCheaperSection } from './OrderWhoCheaperSection';
import { OrderNumbersSection } from './OrderNumbersSection';
import { OrderCostSection } from './OrderCostSection';
import { OrderExitsSection } from './OrderExitsSection';

export interface OrderDetailModalProps {
  row: OpenOrderRow;
  snapshot: OrderDetailSnapshot;
  /**
   * The page's one Order Detail. Page-level rather than the modal's own:
   * its caches outlive this modal (which remounts per order and unmounts on
   * close, and reopening an order must not refetch), and its region and
   * structure books also reclassify the worklist's rows.
   */
  detail: OrderDetail;
  /** A section to open on arrival, e.g. the work-through loss line's "See exits". */
  initialSection?: OrderDetailSectionId;
  onClose: () => void;
}

/** The full breakdown of one open order. */
export function OrderDetailModal({
  row,
  snapshot,
  detail,
  initialSection,
  onClose,
}: OrderDetailModalProps) {
  const { view, checkDeeper } = useOpenOrderDetail(detail, row, snapshot);
  return (
    <OrderDetailContent
      row={row}
      {...view}
      initialSection={initialSection}
      onCheckDeeper={checkDeeper}
      onClose={onClose}
    />
  );
}

export type OrderDetailContentProps = OrderDetailView & {
  row: OpenOrderRow;
  initialSection?: OrderDetailSectionId;
  onCheckDeeper: () => void;
  onClose: () => void;
};

/** The modal's four folding sections, all folded on arrival. */
export type OrderDetailSectionId = 'numbers' | 'whoCheaper' | 'costBasis' | 'exits';

/** The modal itself, rendering a finished view — `OrderDetailModal` is what a page mounts. */
export function OrderDetailContent({
  row,
  deep,
  loadingDeep,
  history,
  stationChecked,
  stationsLoaded,
  regionJumps,
  reprocessing,
  hubs,
  hubsFailed,
  stationNameFor,
  structureMarket,
  relistFees,
  accountingLevel,
  initialSection,
  onCheckDeeper,
  onClose,
}: OrderDetailContentProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const nowTick = useNow();
  // All folded: verdict, Copy and the facts are the answer, each trailing read
  // its summary. Remounts per orderId, so nothing carries between orders.
  const [openSections, setOpenSections] = useState<ReadonlySet<OrderDetailSectionId>>(
    () => new Set(initialSection ? [initialSection] : [])
  );
  const isExpanded = (id: OrderDetailSectionId) => openSections.has(id);
  const toggleSection = (id: OrderDetailSectionId) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const location: LocationState = !stationsLoaded
    ? 'unknown'
    : row.stationName === null
      ? 'structure'
      : 'known';

  const advice = adviseOrder(row);
  const { copyPrice, keepPerUnit } = verdictFigures(row, advice);
  const station =
    location === 'structure'
      ? structureStationScopeState(row, structureMarket)
      : stationScopeState(row, stationChecked, location);
  const system = deepScopeState('system', row, deep, location);
  const region = deepScopeState('region', row, deep, location);
  const sell = computeSellThrough(row, deep, history, new Date(nowTick));

  // "Cheapest here" is the station tier: the price a buyer standing in this
  // station sees first. Exact, never shorthand.
  const cheapestHere = (() => {
    switch (station.kind) {
      case 'rival':
        return formatMarketIsk(station.rival.price);
      case 'clear':
        return t('market.orders.detail.chipYou');
      case 'unavailable':
        return t('market.orders.detail.chipUnreadable');
      case 'notChecked':
        return t('market.orders.trailingNotChecked');
    }
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={row.typeName}
      placement={isPhone ? 'sheet' : 'center'}
      footer={
        isPhone && copyPrice !== null && <CopyPriceButton price={copyPrice} className="w-full" />
      }
    >
      <div className="space-y-4">
        <OrderDetailHeader row={row} advice={advice} copyPrice={copyPrice} isPhone={isPhone} />

        <StatChips>
          <StatChip
            label={t('market.orders.detail.chipYourPrice')}
            value={formatMarketIsk(row.price)}
          />
          <StatChip
            label={t(
              row.isBuyOrder
                ? 'market.orders.detail.chipTopBidHere'
                : 'market.orders.detail.chipCheapestHere'
            )}
            value={cheapestHere}
          />
          {keepPerUnit !== null && (
            <StatChip
              label={t('market.orders.detail.chipYouKeep')}
              value={<IskDelta amount={keepPerUnit} />}
            />
          )}
        </StatChips>

        <div className="divide-y divide-line rounded-xs border border-line">
          <OrderWhoCheaperSection
            row={row}
            station={station}
            system={system}
            region={region}
            deep={deep}
            loadingDeep={loadingDeep}
            regionJumps={regionJumps}
            stationNameFor={stationNameFor}
            expanded={isExpanded('whoCheaper')}
            onToggle={() => toggleSection('whoCheaper')}
            onCheckDeeper={onCheckDeeper}
          />
          <OrderNumbersSection
            row={row}
            deep={deep}
            sell={sell}
            expanded={isExpanded('numbers')}
            onToggle={() => toggleSection('numbers')}
          />
          {/* Cost basis and exits are sell-side ideas: a buy order has neither (#1733). */}
          {!row.isBuyOrder && (
            <OrderCostSection
              row={row}
              location={location}
              relistFees={relistFees}
              accountingLevel={accountingLevel}
              expanded={isExpanded('costBasis')}
              onToggle={() => toggleSection('costBasis')}
            />
          )}
          {!row.isBuyOrder && (
            <OrderExitsSection
              row={row}
              deep={deep}
              sell={sell}
              hubs={hubs}
              hubsFailed={hubsFailed}
              reprocessing={reprocessing}
              expanded={isExpanded('exits')}
              onToggle={() => toggleSection('exits')}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
