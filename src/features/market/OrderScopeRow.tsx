import { fixed1 } from '@/lib/fixedFormat';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatMarketIsk } from '@/lib/isk';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { UndercutScope } from '@/engine/market/undercut';
import { JumpsAwayText } from '@/features/assets/assetBrowserRows';
import { CELL, scopeLabelText, type ScopeState } from './orderScopeState';

const SCOPE_PILL: Record<UndercutScope, string> = {
  station: 'bg-danger/15 text-danger',
  system: 'bg-warning/15 text-warning',
  region: 'bg-accent/15 text-accent',
};

export function ScopeRow({
  scope,
  state,
  stationName,
  distance,
  jumps,
}: {
  scope: UndercutScope;
  state: ScopeState;
  stationName?: string | null;
  distance?: string;
  jumps?: JumpsAwayResult;
}) {
  const { t } = useTranslation();
  const scopeLabel = (
    <span role="rowheader" className={cx(CELL, 'pl-3')}>
      <span
        className={cx(
          'inline-flex h-5 w-fit items-center rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
          SCOPE_PILL[scope]
        )}
      >
        {scopeLabelText(scope, t)}
      </span>
    </span>
  );

  if (state.kind !== 'rival') {
    return (
      <div role="row" className="contents">
        {scopeLabel}
        <span
          role="cell"
          className={cx(
            CELL,
            'col-span-2 pr-3',
            state.kind === 'clear' ? 'text-success' : 'text-text-dim'
          )}
        >
          {state.kind === 'unavailable' && t('market.orders.structureMarketUnavailable')}
          {state.kind === 'notChecked' && t('market.orders.scopeNotChecked')}
          {state.kind === 'clear' && t('market.orders.scopeClear')}
        </span>
      </div>
    );
  }

  const { rival } = state;
  const countsKnown = rival.ordersBeatingMe > 0;
  const distanceText = jumps ? (
    <JumpsAwayText result={jumps} t={t} locationId={rival.locationId} />
  ) : (
    (distance ?? '')
  );
  const whoText = countsKnown
    ? [
        t('market.orders.rowSummary.sellersUnderMe', { count: rival.ordersBeatingMe }),
        t('market.orders.scopeUnitsUnder', { count: rival.unitsBeatingMe }),
      ].join(' · ')
    : t('market.orders.scopeAggregateOnly');

  return (
    <div role="row" className="contents">
      {scopeLabel}
      <span role="cell" className={cx(CELL, 'flex flex-col gap-0.5')}>
        <span>{stationName ?? t('market.unknownStructure')}</span>
        <span className="text-[0.6875rem] text-text-dim">{whoText}</span>
        <span className="text-[0.6875rem] text-text-dim">
          {t('market.orders.scopeOverBy')}:{' '}
          <span className="text-danger tabular-nums">
            {formatMarketIsk(rival.gapIsk)} · {fixed1(rival.gapPct)}%
          </span>
        </span>
        {distanceText !== '' && (
          <span className="text-[0.6875rem] text-text-dim">
            {t('market.orders.scopeDistance')}: {distanceText}
          </span>
        )}
      </span>
      <span role="cell" className={cx(CELL, 'pr-3 text-right tabular-nums')}>
        {formatMarketIsk(rival.price)}
      </span>
    </div>
  );
}
