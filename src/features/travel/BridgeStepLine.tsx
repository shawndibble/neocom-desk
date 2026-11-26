import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import { MassNote } from './MassNote';
import { routeSystemName } from './routeSystemName';

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
      <Icon.BridgeHop size={Icon.ICON_SIZE.sm} aria-hidden="true" />
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
