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
 *
 * An order whose item an Active campaign turn-in takes (#6708) — a sell order
 * filed `turnInPays`, or any buy order — shows the turn-in (`TurnInDetailBody`)
 * in the modal's main area, about the order's own Character, with one line
 * on what it pays over the order's price.
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
import { WorkThroughModalNotes, WorkThroughNextButton } from './WorkThroughControls';
import { useWalkCopyPrice } from './workThroughContext';
import { DividedList } from '@/components/ui/DividedList';
import { TurnInDetailBody } from '@/features/campaigns/TurnInDetail';
import { orderShowsTurnIn, turnInSurfaceLine } from './orderTurnIn';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';

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
  /** A work-through is showing this order: the modal adds the walk's notes and Next. */
  walking?: boolean;
  /** The Active turn-in for the order's item, when one takes it. */
  turnIn?: TurnInOfferDetail | null;
  onClose: () => void;
}

/** The full breakdown of one open order. */
export function OrderDetailModal({
  row,
  snapshot,
  detail,
  walking,
  turnIn,
  onClose,
}: OrderDetailModalProps) {
  const { view, checkDeeper } = useOpenOrderDetail(detail, row, snapshot);
  return (
    <OrderDetailContent
      row={row}
      {...view}
      walking={walking}
      turnIn={turnIn}
      onCheckDeeper={checkDeeper}
      onClose={onClose}
    />
  );
}

export type OrderDetailContentProps = OrderDetailView & {
  row: OpenOrderRow;
  walking?: boolean;
  turnIn?: TurnInOfferDetail | null;
  onCheckDeeper: () => void;
  onClose: () => void;
};

/** The modal's four folding sections, all folded on arrival. */
export type OrderDetailSectionId = 'numbers' | 'whoCheaper' | 'costBasis' | 'exits';

const NONE_OPEN: ReadonlySet<OrderDetailSectionId> = new Set();

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
  walking = false,
  turnIn = null,
  onCheckDeeper,
  onClose,
}: OrderDetailContentProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const nowTick = useNow();
  // All folded: verdict, Copy and the facts are the answer, each trailing read
  // its summary. A page remounts per orderId, but a work-through keeps one
  // modal across orders: the open set is tagged with its order, so Next folds
  // everything again.
  const [opened, setOpened] = useState<{ orderId: number; ids: ReadonlySet<OrderDetailSectionId> }>(
    { orderId: row.orderId, ids: new Set() }
  );
  const openSections = opened.orderId === row.orderId ? opened.ids : NONE_OPEN;
  const isExpanded = (id: OrderDetailSectionId) => openSections.has(id);
  const toggleSection = (id: OrderDetailSectionId) => {
    const ids = new Set(openSections);
    if (!ids.delete(id)) ids.add(id);
    setOpened({ orderId: row.orderId, ids });
  };

  const location: LocationState = !stationsLoaded
    ? 'unknown'
    : row.stationName === null
      ? 'structure'
      : 'known';

  const advice = adviseOrder(row);
  const verdict = verdictFigures(row, advice);
  const { keepPerUnit } = verdict;
  // The verdict's own price first; else the walk's one-tick price (an undercut order).
  const walkPrice = useWalkCopyPrice(walking);
  const copyPrice = verdict.copyPrice ?? walkPrice;
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

  const phoneCopy = isPhone && copyPrice !== null && (
    <CopyPriceButton price={copyPrice} className="w-full" />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={row.typeName}
      placement={isPhone ? 'sheet' : 'center'}
      footer={
        walking ? (
          // Copy keeps the full width on a phone, Next under it; one row from `md`.
          <div className="flex w-full flex-col gap-2 md:flex-row md:justify-end">
            {phoneCopy}
            <WorkThroughNextButton className="w-full md:w-auto" />
          </div>
        ) : (
          phoneCopy
        )
      }
    >
      <div className="space-y-4">
        {walking && <WorkThroughModalNotes row={row} />}
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

        {turnIn && orderShowsTurnIn(row) && (
          <section className="rounded-xs border border-line">
            <TurnInDetailBody
              name={row.typeName}
              offer={turnIn}
              characterId={row.characterId}
              characterName={row.characterName}
              surfaceLine={turnInSurfaceLine(t, row, turnIn.totalPerItem)}
            />
          </section>
        )}

        <DividedList surface="none">
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
        </DividedList>
      </div>
    </Modal>
  );
}
