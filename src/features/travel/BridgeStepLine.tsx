/**
 * One jump over an Ansiblex on a Route Safety route (issue #2478), drawn
 * between its two systems: "⇉ Ansiblex · SYS1 → SYS2 · <gate name>". A fact
 * about the step, never a judgement of it (decision `20260912-172628`).
 */
import { useTranslation } from 'react-i18next';
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import { MassNote } from './MassNote';
import { routeSystemName } from './routeSystemName';

/** A jump over a bridge, between the two route systems it joins. */
export interface BridgeStep {
  from: RouteSafetyRow;
  to: RouteSafetyRow;
  bridge: AnsiblexGate;
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-text-faint">
      ·
    </span>
  );
}

export function BridgeStepLine({ step }: { step: BridgeStep }) {
  const { t } = useTranslation();
  const { from, to, bridge } = step;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xs border border-dashed border-line-bright px-2 py-1 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l-2">
      <span aria-hidden="true">⇉</span>
      <span className="font-semibold">{t('travel.bridges.ansiblex')}</span>
      <Dot />
      <span>
        {t('travel.bridges.ends', { from: routeSystemName(from), to: routeSystemName(to) })}
      </span>
      {bridge.name !== '' && (
        <>
          <Dot />
          <span className="min-w-0 truncate text-text-dim">{bridge.name}</span>
        </>
      )}
      <MassNote hole="bridge" />
    </div>
  );
}
