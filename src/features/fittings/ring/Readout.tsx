import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MakeItFitTrigger } from '../MakeItFitTrigger';
import { type RingGauge } from '@/engine/fittings/ringLayout';
import { type FittingItemState } from '@/engine/fittings/types';
import { typeIconUrl, typeRenderUrl } from '@/lib/eveImages';
import { MODULE_STATE_STYLE } from '../moduleStateStyle';
import { type Budget, GaugeSwatch } from './RimGauge';
import { budgetValue } from './ringFormat';
import { eyebrowClassName as MICRO_LABEL } from '@/components/ui/eyebrowClassName';

export function Readout({
  gauge,
  budget,
  align,
}: {
  gauge: RingGauge;
  budget: Budget;
  /** The side of the ring its gauge is on, so the strip mirrors the rim. */
  align: 'start' | 'end';
}) {
  const { t } = useTranslation();
  const { used, total, flash } = budget;
  const known = used !== null && total !== null;
  const { overBudget, flashKey } = flash;
  const value = budgetValue(t, budget);
  // Drone bandwidth has no fix to offer: no swap, skill or implant makes room for a drone.
  const fixable = gauge === 'cpu' || gauge === 'powergrid' || gauge === 'calibration';
  return (
    <div className={`min-w-0 text-xs tabular-nums ${align === 'end' ? 'text-right' : ''}`}>
      <div
        role="meter"
        aria-label={budget.label}
        aria-valuenow={known ? used : undefined}
        aria-valuemax={known ? total : undefined}
      >
        <p
          className={`flex items-center gap-1.5 ${MICRO_LABEL} ${align === 'end' ? 'flex-row-reverse' : ''}`}
        >
          <GaugeSwatch gauge={gauge} />
          <span className="truncate">{budget.label}</span>
        </p>
        <p
          key={flashKey}
          className={`rounded-xs text-sm ${overBudget ? 'font-semibold text-danger' : 'text-text'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
        >
          {value ?? '…'}
        </p>
        {overBudget && (
          <p className="text-danger">
            {t('fittings.list.overBy', { amount: flash.overage.toFixed(1) })}
          </p>
        )}
      </div>
      {overBudget && fixable && (
        <div className={`flex ${align === 'end' ? 'justify-end' : ''}`}>
          <MakeItFitTrigger resource={gauge} />
        </div>
      )}
    </div>
  );
}

/** The four module-state border colours the tiles use, named — touch has no hover to learn them from. */
export function ModuleStateLegend() {
  const { t } = useTranslation();
  const states: FittingItemState[] = ['offline', 'online', 'active', 'overload'];
  return (
    <ul
      aria-label={t('fittings.ring.legend.title')}
      className="mx-auto flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-dim"
    >
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-3 shrink-0 border-2 bg-bg ${MODULE_STATE_STYLE[state].border}`}
          />
          {t(`fittings.ring.state.${state}`)}
        </li>
      ))}
    </ul>
  );
}

/** The ship's own render, falling back to its icon when the image server has none. */
export function ShipRender({ typeId }: { typeId: number }) {
  const [failed, setFailed] = useState(false);
  const [renderedTypeId, setRenderedTypeId] = useState(typeId);
  if (typeId !== renderedTypeId) {
    setRenderedTypeId(typeId);
    setFailed(false);
  }
  return (
    <img
      src={failed ? typeIconUrl(typeId, 128) : typeRenderUrl(typeId, 512)}
      crossOrigin="anonymous"
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}
