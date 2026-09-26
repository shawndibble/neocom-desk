import { useTranslation } from 'react-i18next';
import { overheatedOrNull } from '@/engine/fittings/stats';
import type { FittingStats, LocalRepair } from '@/engine/fittings/types';
import { Facts, HeatFigure, Overheated } from './StatFacts';

const REPAIR_LAYERS: readonly (keyof LocalRepair)[] = ['shield', 'armor', 'hull'];

/** A signed rate: "+" for what the capacitor gains, "−" (a true minus) for what it loses. */
function signed(value: number, digits: number): string {
  const magnitude = Math.abs(value).toFixed(digits);
  if (Number(magnitude) === 0) return magnitude;
  return value < 0 ? `−${magnitude}` : `+${magnitude}`;
}

/**
 * Local tank under Defense: each repairer layer at burst (with its
 * overheated rate), passive shield regeneration, and the whole tank burst
 * beside sustained in EHP/s — the sustained figure being our own estimate
 * (`engine/fittings/tank.ts`), so it says so.
 */
export function TankFacts({
  stats,
  typeName,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { tank } = stats;
  const hasTank = tank.burstEffective > 0 || tank.sustainedEffective > 0;
  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-xs text-text-dim">
        {REPAIR_LAYERS.filter((layer) => stats.repair[layer] > 0).map((layer) => (
          <li key={layer}>
            <HeatFigure
              stats={stats}
              format={(s) =>
                t(`fittings.stats.repair.${layer}`, { value: s.repair[layer].toFixed(1) })
              }
            />
            <Overheated
              value={overheatedOrNull(stats.repair[layer], stats.overheated?.repair[layer], 1)}
              digits={1}
            />
          </li>
        ))}
        {tank.passiveShield > 0 && (
          <li>
            <HeatFigure
              stats={stats}
              format={(s) =>
                t('fittings.stats.tank.passiveShield', { value: s.tank.passiveShield.toFixed(1) })
              }
            />
          </li>
        )}
        {tank.ancillary.map((row, index) => (
          <li key={`${row.typeId}-${index}`}>
            <HeatFigure
              stats={stats}
              format={(s) => {
                // The same repairer unheated: the ancillary rows line up.
                const same = s.tank.ancillary[index] ?? row;
                return t('fittings.stats.tank.ancillary', {
                  name: typeName(same.typeId),
                  loaded: same.loaded.toFixed(1),
                  empty: same.empty.toFixed(1),
                });
              }}
            />
          </li>
        ))}
      </ul>
      {hasTank && (
        <>
          <Facts
            items={[
              {
                label: t('fittings.stats.tank.burst'),
                value: (
                  <HeatFigure
                    stats={stats}
                    format={(s) =>
                      t('fittings.stats.unit.ehpPerSecond', {
                        value: s.tank.burstEffective.toFixed(1),
                      })
                    }
                  />
                ),
              },
              {
                label: t('fittings.stats.tank.sustained'),
                value: (
                  <HeatFigure
                    stats={stats}
                    format={(s) =>
                      t('fittings.stats.unit.ehpPerSecond', {
                        value: s.tank.sustainedEffective.toFixed(1),
                      })
                    }
                  />
                ),
              },
            ]}
          />
          {tank.capFraction < 1 && (
            <p className="text-xs text-warning">
              {t('fittings.stats.tank.capLimited', {
                pct: (tank.capFraction * 100).toFixed(0),
              })}
            </p>
          )}
          <p className="text-xs text-text-dim">{t('fittings.stats.tank.estimateNote')}</p>
        </>
      )}
    </div>
  );
}

/** Capacitor under its section: what refills it at peak against what the running modules take. */
export function CapacitorFacts({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  const budget = stats.capacitorBudget;
  const perSecond = (value: string) => t('fittings.stats.unit.gjPerSecond', { value });
  const figure = (format: (s: FittingStats) => string) => (
    <HeatFigure stats={stats} format={format} />
  );
  return (
    <Facts
      items={[
        {
          label: t('fittings.stats.fact.capacity'),
          value: figure((s) =>
            t('fittings.stats.unit.gj', { value: s.capacitorCapacity.toFixed(0) })
          ),
        },
        {
          label: t('fittings.stats.fact.recharge'),
          value: figure((s) =>
            t('fittings.stats.unit.seconds', {
              value: (s.capacitorRechargeTime / 1000).toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.cap.peakRecharge'),
          value: figure((s) => perSecond(s.capacitorBudget.peakRecharge.toFixed(1))),
        },
        {
          label: t('fittings.stats.cap.drain'),
          value: figure((s) => perSecond(signed(-s.capacitorBudget.drain, 1))),
        },
        ...(budget.boosterInjection > 0
          ? [
              {
                label: t('fittings.stats.cap.boosters'),
                value: figure((s) => perSecond(signed(s.capacitorBudget.boosterInjection, 1))),
              },
            ]
          : []),
        ...(budget.nosferatuGain > 0
          ? [
              {
                label: t('fittings.stats.cap.nosferatu'),
                value: figure((s) => perSecond(signed(s.capacitorBudget.nosferatuGain, 1))),
              },
            ]
          : []),
        {
          label: t('fittings.stats.cap.delta'),
          value: (
            <span className={budget.delta < 0 ? 'text-warning' : ''}>
              {figure((s) => perSecond(signed(s.capacitorBudget.delta, 1)))}
            </span>
          ),
        },
        ...(budget.secondsPerBoosterCharge !== null
          ? [
              {
                label: t('fittings.stats.cap.boosterCharge'),
                value: figure((s) =>
                  s.capacitorBudget.secondsPerBoosterCharge === null
                    ? ''
                    : t('fittings.stats.cap.chargeEvery', {
                        seconds: s.capacitorBudget.secondsPerBoosterCharge.toFixed(1),
                      })
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * The one tank figure the Ring shows under its CPU / powergrid readouts: the
 * sustained tank in EHP/s. Nothing until the stats are in.
 */
export function SustainedTankReadout({
  stats,
  className = '',
}: {
  stats: FittingStats | null;
  className?: string;
}) {
  const { t } = useTranslation();
  if (stats === null) return null;
  return (
    <p className={`text-xs tabular-nums ${className}`}>
      <span className="text-text-dim">{t('fittings.stats.tank.sustained')}</span>{' '}
      <span>
        {t('fittings.stats.unit.ehpPerSecond', {
          value: stats.tank.sustainedEffective.toFixed(0),
        })}
      </span>
    </p>
  );
}
