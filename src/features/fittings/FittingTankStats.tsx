import { useTranslation } from 'react-i18next';
import type { FittingStats, LocalRepair } from '@/engine/fittings/types';
import { Facts, HeatFigure, StatGroup, StatNote, type Fact } from './StatFacts';
import { fixed0, fixed1, fixedFormat } from '@/lib/fixedFormat';

const REPAIR_LAYERS: readonly (keyof LocalRepair)[] = ['shield', 'armor', 'hull'];

/** A signed rate: "+" for what the capacitor gains, "−" (a true minus) for what it loses. */
function signed(value: number, digits: number): string {
  const magnitude = fixedFormat(digits)(Math.abs(value));
  if (Number(magnitude) === 0) return magnitude;
  return value < 0 ? `−${magnitude}` : `+${magnitude}`;
}

/**
 * Local tank under Defense, one fact each: every repairer layer at burst,
 * passive shield regeneration, each ancillary repairer with paste and dry,
 * and the whole tank burst beside sustained in EHP/s — the sustained figure
 * being our own estimate (`engine/fittings/tank.ts`), so it says so.
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
  const figure = (format: (s: FittingStats) => string) => (
    <HeatFigure stats={stats} format={format} />
  );
  const perSecond = (value: number) =>
    t('fittings.stats.unit.hpPerSecond', { value: fixed1(value) });
  const facts: Fact[] = [
    ...REPAIR_LAYERS.filter((layer) => stats.repair[layer] > 0).map((layer) => ({
      label: t(`fittings.stats.repair.${layer}`),
      value: figure((s) => perSecond(s.repair[layer])),
    })),
    ...(tank.passiveShield > 0
      ? [
          {
            label: t('fittings.stats.tank.passiveShield'),
            value: figure((s) => perSecond(s.tank.passiveShield)),
          },
        ]
      : []),
    ...tank.ancillary.map((row, index) => ({
      id: `ancillary-${index}`,
      label: typeName(row.typeId),
      value: figure((s) => {
        // The same repairer unheated: the ancillary rows line up.
        const same = s.tank.ancillary[index] ?? row;
        return t('fittings.stats.tank.ancillary', {
          loaded: fixed1(same.loaded),
          empty: fixed1(same.empty),
        });
      }),
    })),
    ...(hasTank
      ? [
          {
            label: t('fittings.stats.tank.burst'),
            value: figure((s) =>
              t('fittings.stats.unit.ehpPerSecond', { value: fixed1(s.tank.burstEffective) })
            ),
          },
          {
            label: t('fittings.stats.tank.sustained'),
            value: figure((s) =>
              t('fittings.stats.unit.ehpPerSecond', {
                value: fixed1(s.tank.sustainedEffective),
              })
            ),
          },
        ]
      : []),
  ];
  if (facts.length === 0) return null;
  return (
    <>
      <StatGroup label={t('fittings.stats.tank.title')}>
        <Facts items={facts} />
      </StatGroup>
      {hasTank && tank.capFraction < 1 && (
        <StatNote tone="warning">
          {t('fittings.stats.tank.capLimited', { pct: fixed0(tank.capFraction * 100) })}
        </StatNote>
      )}
      {hasTank && <StatNote>{t('fittings.stats.tank.estimateNote')}</StatNote>}
    </>
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
          value: figure((s) => t('fittings.stats.unit.gj', { value: fixed0(s.capacitorCapacity) })),
        },
        {
          label: t('fittings.stats.fact.recharge'),
          value: figure((s) =>
            t('fittings.stats.unit.seconds', {
              value: fixed0(s.capacitorRechargeTime / 1000),
            })
          ),
        },
        {
          label: t('fittings.stats.cap.peakRecharge'),
          value: figure((s) => perSecond(fixed1(s.capacitorBudget.peakRecharge))),
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
                        seconds: fixed1(s.capacitorBudget.secondsPerBoosterCharge),
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
          value: fixed1(stats.tank.sustainedEffective),
        })}
      </span>
    </p>
  );
}
