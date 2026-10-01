import { useTranslation } from 'react-i18next';
import type { FittingStats } from '@/engine/fittings/types';
import { kmValue } from './rangeText';
import { StatGroup, StatRow, StatRows } from './StatFacts';
import { joinDetail } from './statKit';

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
  const km = (meters: number) => t('fittings.stats.unit.km', { value: kmValue(meters) });
  const seconds = (value: number) => t('fittings.stats.unit.seconds', { value: value.toFixed(1) });
  const every = (cycleSeconds: number) =>
    t('fittings.stats.fleetBoosts.every', { cycle: seconds(cycleSeconds) });

  return (
    <>
      {bursts.length > 0 && (
        <StatRows>
          {bursts.map((burst) => (
            <StatRow
              key={`${burst.typeId}:${burst.chargeTypeId ?? ''}`}
              name={t('fittings.stats.weaponRow', {
                count: burst.count,
                name: typeName(burst.typeId),
              })}
              detail={
                burst.chargeTypeId === undefined
                  ? t('fittings.stats.fleetBoosts.noCharge')
                  : joinDetail([
                      typeName(burst.chargeTypeId),
                      km(burst.rangeMeters),
                      t('fittings.stats.fleetBoosts.lasts', {
                        value: seconds(burst.durationSeconds),
                      }),
                      t('fittings.stats.fleetBoosts.reloadTime', {
                        value: seconds(burst.reloadSeconds),
                      }),
                    ])
              }
              detailTone={burst.chargeTypeId === undefined ? 'warning' : undefined}
              figure={burst.strengths.map((value) => `${value.toFixed(1)}%`).join(' · ') || '—'}
            />
          ))}
        </StatRows>
      )}
      {(compressors.length > 0 || core) && (
        <StatGroup label={t('fittings.stats.fleetBoosts.compression')}>
          <StatRows>
            {compressors.map((compressor) => (
              <StatRow
                key={compressor.typeId}
                name={t('fittings.stats.weaponRow', {
                  count: compressor.count,
                  name: typeName(compressor.typeId),
                })}
                detail={every(compressor.cycleSeconds)}
                figure={km(compressor.rangeMeters)}
              />
            ))}
            {core && (
              <StatRow
                name={typeName(core.typeId)}
                detail={every(core.cycleSeconds)}
                figure={t('fittings.stats.fleetBoosts.fuel', {
                  value: core.fuelPerCycle.toFixed(0),
                  fuel: typeName(core.fuelTypeId),
                })}
              />
            )}
          </StatRows>
        </StatGroup>
      )}
    </>
  );
}
