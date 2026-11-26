import { useContext, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, IskAmount, textActionClassName } from '@/components/ui';
import { formatMarketIsk } from '@/lib/isk';
import type { OpenOrderRow } from './openOrdersModel';
import type { WorkThroughPrice } from './useWorkThrough';
import { WorkThroughContext, type WorkThroughContextValue } from './workThroughContext';
import { workThroughLoss } from './workThrough';
import { formatOrderFloorPrice } from './orderRowFormat';

function Dot() {
  return (
    <span aria-hidden="true" className="text-text-dim">
      ·
    </span>
  );
}

function TextAction({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={textActionClassName('inline-flex whitespace-nowrap')}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}

export function WorkThroughSummaryTail() {
  const { t } = useTranslation();
  const context = useContext(WorkThroughContext);
  if (context === null) return null;
  const { workThrough } = context;
  if (!workThrough.running) {
    if (workThrough.queueCount === 0) return null;
    return (
      <>
        <Dot />
        <TextAction onClick={workThrough.start}>
          {t('market.orders.workThrough.start', { total: workThrough.queueCount })}
        </TextAction>
      </>
    );
  }
  const { position, total } = workThrough.progress;
  return (
    <>
      <Dot />
      <span className="tabular-nums text-text">
        {workThrough.currentId === null
          ? t('market.orders.workThrough.done', { total })
          : t('market.orders.workThrough.progress', { position, total })}
      </span>
      <Dot />
      <TextAction onClick={workThrough.stop}>{t('market.orders.workThrough.stop')}</TextAction>
    </>
  );
}

function priceLine(price: WorkThroughPrice | null, t: TFunction) {
  if (price === null) return t('market.orders.workThrough.reading');
  if (price.kind === 'price')
    return t('market.orders.workThrough.newPrice', { price: formatMarketIsk(price.price) });
  if (price.kind === 'noRival') return t('market.orders.workThrough.noRival');
  return t('market.orders.workThrough.unavailable');
}

function LossLine({ row, context }: { row: OpenOrderRow; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  const price = context.workThrough.preview;
  if (price?.kind !== 'price') return null;
  const loss = workThroughLoss(row, price.price);
  if (loss === null) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-danger">
      {loss.kind === 'costUnknown' ? (
        t('market.orders.workThrough.costUnknown')
      ) : (
        <>
          <span className="tabular-nums">
            <Trans
              i18nKey="market.orders.workThrough.loses"
              values={{ price: formatMarketIsk(price.price) }}
              components={{ isk: <IskAmount value={loss.amount} /> }}
            />
          </span>
        </>
      )}
    </span>
  );
}

function OwnerNote({ row, context }: { row: OpenOrderRow; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  if (!context.manyOwners || !context.canOpenInEve(row.characterId)) return null;
  return (
    <span className="text-xs text-text-dim">
      {t('market.orders.workThrough.logInAs', { name: row.characterName })}
    </span>
  );
}

export function WorkThroughModalNotes({ row }: { row: OpenOrderRow }) {
  const { t } = useTranslation();
  const context = useContext(WorkThroughContext);
  if (context === null) return null;
  const { workThrough } = context;
  const { position, total } = workThrough.progress;
  const price = workThrough.preview;
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
        <span className="tabular-nums font-semibold text-text">
          {t('market.orders.workThrough.progress', { position, total })}
        </span>
        {price?.kind !== 'price' && (
          <>
            <Dot />
            <span className="text-text-dim">{priceLine(price, t)}</span>
          </>
        )}
      </p>
      {row.floor !== null && !row.isBuyOrder && (
        <p className="text-xs text-text-dim tabular-nums">
          {t('market.orders.workThrough.floor', { price: formatOrderFloorPrice(row.floor) })}
        </p>
      )}
      <LossLine row={row} context={context} />
      <OwnerNote row={row} context={context} />
    </div>
  );
}

export function WorkThroughNextButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const context = useContext(WorkThroughContext);
  if (context === null) return null;
  const { workThrough } = context;
  const { position, total } = workThrough.progress;
  return (
    <Button variant="primary" className={className} onClick={workThrough.next}>
      {position >= total
        ? t('market.orders.workThrough.done', { total })
        : t('market.orders.workThrough.next')}
    </Button>
  );
}

function RowStatus({ orderId, context }: { orderId: number; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  if (!context.workThrough.notChangedIds.has(orderId)) return null;
  return <span className="text-xs text-warning">{t('market.orders.workThrough.notChanged')}</span>;
}

function useRowWorkThrough(row: OpenOrderRow) {
  const context = useContext(WorkThroughContext);
  if (context === null) return null;
  return context.workThrough.handled.has(row.orderId) ? { context } : null;
}

export function WorkThroughTableSlot({
  row,
  fallback,
}: {
  row: OpenOrderRow;
  fallback: ReactNode;
}) {
  const place = useRowWorkThrough(row);
  if (place === null) return <>{fallback}</>;
  return <RowStatus orderId={row.orderId} context={place.context} />;
}

export function WorkThroughListSlot({ row }: { row: OpenOrderRow }) {
  const place = useRowWorkThrough(row);
  if (place === null) return null;
  return (
    <div className="px-3 pb-2">
      <RowStatus orderId={row.orderId} context={place.context} />
    </div>
  );
}
