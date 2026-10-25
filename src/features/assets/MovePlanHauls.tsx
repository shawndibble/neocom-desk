import { formatCount } from '@/lib/formatCount';
import { useTranslation } from 'react-i18next';
import type { PickupHauls } from '@/engine/assets/movePlan';
import { formatIsk } from '@/lib/isk';
import { formatCubicMetres } from '@/lib/volume';
import { PlanLine } from './MovePlanLine';
import { foldHauls } from './movePlanView';

interface PickupHaulListProps {
  pickup: PickupHauls;
  name: (typeId: number) => string;
}

/**
 * One pickup's load split into hauls: what goes in the cargo hold and what in
 * the fleet hangar, haul by haul. Identical neighbouring hauls fold into one
 * range; every line is shown.
 */
export function PickupHaulList({ pickup, name }: PickupHaulListProps) {
  const { t } = useTranslation();
  const total = pickup.hauls.length;
  return (
    <div className="flex flex-col gap-2 pt-1.5 pb-1.5">
      {foldHauls(pickup.hauls).map((run) => (
        <section key={run.from} className="flex flex-col gap-1">
          <h4 className="m-0 text-xs font-semibold tracking-wide text-text-dim uppercase tabular-nums">
            {run.from === run.to
              ? t('assets.movePlan.haulHeading', { n: run.from, total })
              : t('assets.movePlan.haulRangeHeading', { from: run.from, to: run.to, total })}
            {run.haul.iskValue > 0 && (
              <span className="ml-2 normal-case">
                {t('assets.movePlan.haulValue', { value: formatIsk(run.haul.iskValue) })}
              </span>
            )}
          </h4>
          {run.haul.holds
            .filter((hold) => hold.lines.length > 0)
            .map((hold) => (
              <div key={hold.kind} className="rounded-xs border border-line px-2.5 pb-0.5">
                <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 pt-1.5 text-sm font-semibold">
                  {hold.kind === 'fleetHangar'
                    ? t('assets.movePlan.holdFleetHangar')
                    : t('assets.movePlan.holdCargo')}
                  <span className="text-xs font-normal text-text-dim tabular-nums">
                    {t('assets.movePlan.holdFill', {
                      used: formatCubicMetres(hold.usedM3),
                      capacity: formatCubicMetres(hold.capacityM3),
                    })}
                  </span>
                </p>
                <ul className="m-0 flex list-none flex-col p-0">
                  {hold.lines.map((l) => (
                    <PlanLine
                      key={l.typeId}
                      name={name(l.typeId)}
                      qty={`× ${formatCount(l.quantity)}`}
                      trailing={`${formatCubicMetres(l.m3)} m³`}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </section>
      ))}
      {pickup.tooBigShips.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="m-0 text-xs font-semibold tracking-wide text-warning uppercase">
            {t('assets.movePlan.tooBigHeading')}
          </h4>
          <ul className="m-0 flex list-none flex-col p-0">
            {pickup.tooBigShips.map((u) => (
              <PlanLine
                key={u.typeId}
                name={name(u.typeId)}
                qty={`× ${formatCount(u.quantity)}`}
                trailing={t('assets.movePlan.unfitLine', { unit: formatCubicMetres(u.unitM3) })}
                dim
              />
            ))}
          </ul>
        </section>
      )}
      {pickup.overLimit.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="m-0 text-xs font-semibold tracking-wide text-warning uppercase">
            {t('assets.movePlan.overLimitHeading')}
          </h4>
          <ul className="m-0 flex list-none flex-col p-0">
            {pickup.overLimit.map((u) => (
              <PlanLine
                key={u.typeId}
                name={name(u.typeId)}
                qty={`× ${formatCount(u.quantity)}`}
                trailing={t('assets.movePlan.overLimitLine', {
                  value: formatIsk(u.unitIsk ?? 0),
                })}
                dim
              />
            ))}
          </ul>
        </section>
      )}
      {pickup.unfit.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="m-0 text-xs font-semibold tracking-wide text-warning uppercase">
            {t('assets.movePlan.unfitHeading')}
          </h4>
          <ul className="m-0 flex list-none flex-col p-0">
            {pickup.unfit.map((u) => (
              <PlanLine
                key={u.typeId}
                name={name(u.typeId)}
                qty={`× ${formatCount(u.quantity)}`}
                trailing={t('assets.movePlan.unfitLine', { unit: formatCubicMetres(u.unitM3) })}
                dim
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
