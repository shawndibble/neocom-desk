/**
 * Open Orders' work-through mode, on screen (issue #3991). No bar or row of
 * its own: the start action and progress end the page's summary line, and
 * the current order's controls sit inside its own row. Rows reach the state
 * through context, so the panel's memoized table columns never go stale.
 */
import { useContext, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, IskAmount, textActionClassName } from '@/components/ui';
import { formatIskAuto } from '@/lib/isk';
import type { OpenOrderRow } from './openOrdersModel';
import type { WorkThroughPrice } from './useWorkThrough';
import { WorkThroughContext, type WorkThroughContextValue } from './workThroughContext';
import { workThroughLoss } from './workThrough';

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

/** "Work through (12)" at the end of the summary line, or "3 of 12 · Stop" while running. */
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
  const { current, position, total } = workThrough.progress;
  return (
    <>
      <Dot />
      <span className="tabular-nums text-text">
        {current === null
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
    return t('market.orders.workThrough.newPrice', { price: formatIskAuto(price.price) });
  if (price.kind === 'noRival') return t('market.orders.workThrough.noRival');
  return t('market.orders.workThrough.unavailable');
}

/** The red line a below-floor order carries: what the new price loses, or that the cost is unknown. */
function LossLine({ row, price }: { row: OpenOrderRow; price: WorkThroughPrice | null }) {
  const { t } = useTranslation();
  const context = useContext(WorkThroughContext);
  if (price?.kind !== 'price' || context === null) return null;
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
              values={{ price: formatIskAuto(price.price) }}
              components={{ isk: <IskAmount value={loss.amount} /> }}
            />
          </span>
          <Button size="sm" onClick={() => context.onSeeExits(row)}>
            {t('market.orders.workThrough.seeExits')}
          </Button>
        </>
      )}
    </span>
  );
}

function OwnerNote({ row }: { row: OpenOrderRow }) {
  const { t } = useTranslation();
  const context = useContext(WorkThroughContext);
  if (context === null || !context.manyOwners || !context.canOpenInEve(row.characterId)) {
    return null;
  }
  return (
    <span className="text-xs text-text-dim">
      {t('market.orders.workThrough.logInAs', { name: row.characterName })}
    </span>
  );
}

/** The current row's controls on a desktop table: the price, Next and Skip. */
function TableControls({ row, context }: { row: OpenOrderRow; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  const { workThrough } = context;
  const pending = workThrough.pendingId === row.orderId;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <span className="tabular-nums text-text">{priceLine(workThrough.preview, t)}</span>
        <Dot />
        <TextAction onClick={workThrough.next} disabled={pending}>
          {pending ? t('market.orders.workThrough.working') : t('market.orders.workThrough.next')}
        </TextAction>
        <Dot />
        <TextAction onClick={workThrough.skip} disabled={pending}>
          {t('market.orders.workThrough.skip')}
        </TextAction>
      </span>
      <LossLine row={row} price={workThrough.preview} />
      <OwnerNote row={row} />
    </span>
  );
}

/** The current row's controls on a phone: no copy, the new price large, then Open in EVE · Next · Skip. */
function ListControls({ row, context }: { row: OpenOrderRow; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  const { workThrough, canOpenInEve } = context;
  const price = workThrough.preview;
  return (
    <div className="space-y-2 px-3 pb-3">
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('market.orders.workThrough.newPriceLabel')}
        </p>
        {price?.kind === 'price' ? (
          <p className="text-2xl font-semibold text-text tabular-nums">
            {formatIskAuto(price.price)}
          </p>
        ) : (
          <p className="text-sm text-text-dim">{priceLine(price, t)}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5">
        {canOpenInEve(row.characterId) && (
          <>
            <TextAction onClick={workThrough.openCurrent}>
              {t('market.orders.workThrough.openInEve')}
            </TextAction>
            {workThrough.currentSent && (
              <span className="text-xs text-success">{t('market.orders.workThrough.sent')}</span>
            )}
            <Dot />
          </>
        )}
        <TextAction onClick={workThrough.next}>{t('market.orders.workThrough.next')}</TextAction>
        <Dot />
        <TextAction onClick={workThrough.skip}>{t('market.orders.workThrough.skip')}</TextAction>
      </div>
      <LossLine row={row} price={price} />
      <OwnerNote row={row} />
    </div>
  );
}

/** What a row already passed says: copied, sent, or — from an orders read after the press — not changed. */
function RowStatus({ orderId, context }: { orderId: number; context: WorkThroughContextValue }) {
  const { t } = useTranslation();
  const handled = context.workThrough.handled.get(orderId);
  if (handled === undefined) return null;
  const parts: ReactNode[] = [];
  if (handled.copied && handled.newPrice !== null) {
    parts.push(
      <span key="copied" className="tabular-nums text-text-dim">
        {t('market.orders.workThrough.copied', { price: formatIskAuto(handled.newPrice) })}
      </span>
    );
  }
  if (context.workThrough.notChangedIds.has(orderId)) {
    parts.push(
      <span key="status" className="text-warning">
        {t('market.orders.workThrough.notChanged')}
      </span>
    );
  } else if (handled.sent) {
    parts.push(
      <span key="status" className="text-success">
        {t('market.orders.workThrough.sent')}
      </span>
    );
  }
  if (parts.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
      {parts.map((part, index) => (
        <span key={index} className="contents">
          {index > 0 && <Dot />}
          {part}
        </span>
      ))}
    </span>
  );
}

/**
 * A desktop row's work-through content in place of its summary sentence:
 * the current row's controls, or a passed row's status. Anything else (or
 * not running) renders `fallback`.
 */
export function WorkThroughTableSlot({
  row,
  fallback,
}: {
  row: OpenOrderRow;
  fallback: ReactNode;
}) {
  const context = useContext(WorkThroughContext);
  if (context === null || !context.workThrough.running) return <>{fallback}</>;
  if (context.workThrough.progress.current?.orderId === row.orderId) {
    return <TableControls row={row} context={context} />;
  }
  if (context.workThrough.handled.has(row.orderId)) {
    return <RowStatus orderId={row.orderId} context={context} />;
  }
  return <>{fallback}</>;
}

/** A phone row's work-through content, below the row's own button (buttons don't nest). */
export function WorkThroughListSlot({ row }: { row: OpenOrderRow }) {
  const context = useContext(WorkThroughContext);
  if (context === null || !context.workThrough.running) return null;
  if (context.workThrough.progress.current?.orderId === row.orderId) {
    return <ListControls row={row} context={context} />;
  }
  if (context.workThrough.handled.has(row.orderId)) {
    return (
      <div className="px-3 pb-2">
        <RowStatus orderId={row.orderId} context={context} />
      </div>
    );
  }
  return null;
}
