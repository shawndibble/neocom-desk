import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StatChip, StatChips } from '@/components/ui';
import { formatMarketIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
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
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { TurnInDetailBody } from '@/features/campaigns/TurnInDetail';
import { orderShowsTurnIn, turnInSurfaceLine } from './orderTurnIn';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';

export interface OrderDetailModalProps {
  row: OpenOrderRow;
  snapshot: OrderDetailSnapshot;
  detail: OrderDetail;
  walking?: boolean;
  turnIn?: TurnInOfferDetail | null;
  onClose: () => void;
}

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

export type OrderDetailSectionId = 'numbers' | 'whoCheaper' | 'costBasis' | 'exits';

const NONE_OPEN: ReadonlySet<OrderDetailSectionId> = new Set();

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
  const turnInHeadingId = useId();
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
  const walkPrice = useWalkCopyPrice(walking);
  const copyPrice = verdict.copyPrice ?? walkPrice;
  const station =
    location === 'structure'
      ? structureStationScopeState(row, structureMarket)
      : stationScopeState(row, stationChecked, location);
  const system = deepScopeState('system', row, deep, location);
  const region = deepScopeState('region', row, deep, location);
  const sell = computeSellThrough(row, deep, history, new Date(nowTick));

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
          <section aria-labelledby={turnInHeadingId} className="rounded-xs border border-line">
            <h3 id={turnInHeadingId} className={cx(eyebrowClassName, 'px-3 pt-3')}>
              {t('market.orders.turnIn.heading')}
            </h3>
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
