import { useTranslation } from 'react-i18next';
import type { BurstRow } from '@/engine/fittings/fleetSupport';
import type { FittingStats } from '@/engine/fittings/types';
import { Facts } from './StatFacts';

/**
 * Fleet boosts: each running burst with the charge it carries, how strong,
 * far-reaching, long and slow to reload it is, then the industrial core's
 * compression — compressor range, and the fuel each activation burns. Only on
 * a fit that has one (`fleetSupport.ts`).
 */
export function FleetBoostFacts({
  stats,
  typeName,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { bursts, compressors, core } = stats.fleetSupport;
  const km = (meters: number) => t('fittings.stats.unit.km', { value: (meters / 1000).toFixed(1) });
  const seconds = (value: number) => t('fittings.stats.unit.seconds', { value: value.toFixed(1) });
  const burstFacts = (burst: BurstRow) => [
    {
      label: t('fittings.stats.fleetBoosts.strength'),
      value: burst.strengths.map((value) => `${value.toFixed(1)}%`).join(' · ') || '—',
    },
    { label: t('fittings.stats.fleetBoosts.range'), value: km(burst.rangeMeters) },
    { label: t('fittings.stats.fleetBoosts.length'), value: seconds(burst.durationSeconds) },
    { label: t('fittings.stats.fleetBoosts.reload'), value: seconds(burst.reloadSeconds) },
  ];

  return (
    <div className="space-y-3">
      {bursts.map((burst) => (
        <div key={`${burst.typeId}:${burst.chargeTypeId ?? ''}`} className="space-y-1.5">
          <div className="text-xs">
            {t('fittings.stats.weaponRow', { count: burst.count, name: typeName(burst.typeId) })}
            <span className="block text-text-dim">
              {burst.chargeTypeId === undefined
                ? t('fittings.stats.fleetBoosts.noCharge')
                : typeName(burst.chargeTypeId)}
            </span>
          </div>
          <Facts items={burstFacts(burst)} />
        </div>
      ))}
      {(compressors.length > 0 || core) && (
        <Facts
          items={[
            ...compressors.map((compressor) => ({
              label: t('fittings.stats.weaponRow', {
                count: compressor.count,
                name: typeName(compressor.typeId),
              }),
              value: t('fittings.stats.fleetBoosts.compressorRange', {
                range: km(compressor.rangeMeters),
                cycle: seconds(compressor.cycleSeconds),
              }),
            })),
            ...(core
              ? [
                  {
                    label: typeName(core.typeId),
                    value: t('fittings.stats.fleetBoosts.fuel', {
                      value: core.fuelPerCycle.toFixed(0),
                      fuel: typeName(core.fuelTypeId),
                      cycle: seconds(core.cycleSeconds),
                    }),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
