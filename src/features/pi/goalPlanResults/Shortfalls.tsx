/** What stops the plan: every shortfall, with what would fix it. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { Shortfall } from '@/engine/pi/goalTypes';
import { commodityName, formatUnits } from '../goalPlannerFormat';
import { PI_MAP_HREF } from '../piPlanLink';
import type { ShortfallHint } from '../goalPlanView';
import { ColonyLink } from './ColonyLink';
import { limitsText, planetTypesText, type PlanNames } from './format';

function ColonyNames({ ids, names }: { ids: readonly number[]; names: PlanNames }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <ColonyLink planetId={id} names={names} />
        </span>
      ))}
    </>
  );
}

function shortfallText(
  shortfall: Shortfall,
  hint: ShortfallHint,
  names: PlanNames,
  t: TFunction
): ReactNode {
  const { pi } = names;
  switch (shortfall.kind) {
    case 'type-gap':
      return (
        <>
          {t(hint?.kind === 'switched-off' ? 'piPlan.shortTypeGapEnabled' : 'piPlan.shortTypeGap', {
            types: planetTypesText(shortfall.fixPlanetTypes, t),
            p0: commodityName(shortfall.p0TypeId, pi),
            p1: commodityName(shortfall.p1TypeId, pi),
            p1Rate: formatUnits(Math.round(shortfall.p1UnitsPerHour)),
            p0Rate: formatUnits(Math.round(shortfall.unitsPerHour)),
          })}{' '}
          {hint?.kind === 'switched-off' ? (
            <>
              {t('piPlan.shortSwitchedOff')} <ColonyNames ids={hint.planetIds} names={names} />.
            </>
          ) : (
            <Link className={inlineLinkClassName} to={PI_MAP_HREF}>
              {t('piPlan.openMap')}
            </Link>
          )}
        </>
      );
    case 'budget-gap':
      return (
        <>
          {t('piPlan.shortBudgetGap', {
            p0: commodityName(shortfall.p0TypeId, pi),
            p1: commodityName(shortfall.p1TypeId, pi),
            p1Rate: formatUnits(Math.round(shortfall.p1UnitsPerHour)),
            p0Rate: formatUnits(Math.round(shortfall.unitsPerHour)),
          })}{' '}
          {hint?.kind === 'retarget' ? (
            <>
              {t('piPlan.shortRetarget', { p0: commodityName(shortfall.p0TypeId, pi) })}{' '}
              <ColonyNames ids={hint.planetIds} names={names} />.
            </>
          ) : (
            t('piPlan.shortBuy', { p1: commodityName(shortfall.p1TypeId, pi) })
          )}
        </>
      );
    case 'no-factory-host':
      return t('piPlan.shortNoHost', { facility: t(`piShared.pinKind.${shortfall.facility}`) });
    case 'host-over-budget':
      return (
        <>
          <ColonyLink planetId={shortfall.planetId} names={names} />{' '}
          {t('piPlan.shortHostOver', { limits: limitsText(shortfall.limitedBy, t) })}
        </>
      );
  }
}

export function Shortfalls({
  shortfalls,
  hints,
  names,
}: {
  shortfalls: readonly Shortfall[];
  hints: readonly ShortfallHint[];
  names: PlanNames;
}) {
  const { t } = useTranslation();
  if (shortfalls.length === 0) return null;
  return (
    <Panel title={t('piPlan.shortfallsTitle', { count: shortfalls.length })}>
      <ul className="space-y-2">
        {shortfalls.map((shortfall, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text">
            <Icon.Warn
              aria-hidden="true"
              size={Icon.ICON_SIZE.sm}
              className="mt-px shrink-0 text-warning"
            />
            <span>{shortfallText(shortfall, hints[i] ?? null, names, t)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
