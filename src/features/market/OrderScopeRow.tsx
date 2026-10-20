import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatMarketIsk } from '@/lib/isk';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { UndercutScope } from '@/engine/market/undercut';
import { JumpsAwayText } from '@/features/assets/assetBrowserRows';
import { CELL, scopeLabelText, type ScopeState } from './orderScopeState';

/** Scope pill colours: the same station/system/region ladder the row badges use. */
const SCOPE_PILL: Record<UndercutScope, string> = {
  station: 'bg-danger/15 text-danger',
  system: 'bg-warning/15 text-warning',
  region: 'bg-accent/15 text-accent',
};

/**
 * One scope's line in the "Who is cheaper" table.
 *
 * The seller cell carries the station, the ISK gap and the distance, because
 * the three scopes routinely carry the SAME rival — one seller at your own
 * station is, by construction, also the cheapest in your system and can be
 * the cheapest in the region too. Three identical ISK figures on three bare
 * rows read as a bug; the same three beside where they sit, the gap, and the
 * distance read as what they are.
 *
 * A state that isn't a rival (not checked, clear, structure) has nothing to
 * put in the seller and price columns, so it spans them rather than printing
 * dashes.
 */
export function ScopeRow({
  scope,
  state,
  stationName,
  distance,
  jumps,
}: {
  scope: UndercutScope;
  state: ScopeState;
  /** Where the rival sits, when this app resolved that location. */
  stationName?: string | null;
  /** Fixed distance wording for a scope whose answer is structural (station, system). */
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
  // The station tier is a Fuzzwork aggregate: a price, never an order count.
  // `stationScopeState` fills those fields with 0, so they are only ever read
  // when the deep book actually supplied them.
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
        {/*
          The gap and distance ride under the seller as labelled words: the
          dialog is narrow at every width, and a bare red number under no
          column header says nothing.
        */}
        <span className="text-[0.6875rem] text-text-dim">
          {t('market.orders.scopeOverBy')}:{' '}
          <span className="text-danger tabular-nums">
            {formatMarketIsk(rival.gapIsk)} · {rival.gapPct.toFixed(1)}%
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
