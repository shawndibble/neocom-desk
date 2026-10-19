import type { FittingStats } from '@/engine/fittings/types';
import type { Fact } from '../StatFacts';
import type { Figure } from './statFigures';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Holds, jump drive and sensors: what the hull carries, beside what the fit asks of it. */
export function resourceFacts(
  s: FittingStats,
  figure: Figure,
  typeName: (typeId: number) => string,
  t: Translate
): Fact[] {
  const facts: Fact[] = [
    {
      label: t('fittings.stats.fact.cargo'),
      value: figure((x) =>
        t('fittings.stats.unit.cubicMetres', { value: x.holds.cargo.toFixed(0) })
      ),
    },
  ];
  if (s.holds.fleetHangar > 0)
    facts.push({
      label: t('fittings.stats.fact.fleetHangar'),
      value: figure((x) =>
        t('fittings.stats.unit.cubicMetres', { value: x.holds.fleetHangar.toFixed(0) })
      ),
    });
  if (s.holds.miningHold > 0)
    facts.push({
      label: t('fittings.stats.fact.miningHold'),
      value: figure((x) =>
        t('fittings.stats.unit.cubicMetres', { value: x.holds.miningHold.toFixed(0) })
      ),
    });
  if (s.sensor.type !== null)
    facts.push({
      label: t('fittings.stats.fact.sensorStrength'),
      value: figure((x) =>
        t('fittings.stats.unit.sensor', {
          value: x.sensor.strength.toFixed(1),
          type: t(`fittings.stats.sensorType.${x.sensor.type}`),
        })
      ),
    });
  if (s.jumpDrive) {
    const { fuelTypeId } = s.jumpDrive;
    facts.push(
      {
        label: t('fittings.stats.fact.jumpRange'),
        value: figure((x) =>
          t('fittings.stats.unit.lightYears', {
            value: (x.jumpDrive?.rangeLightYears ?? 0).toFixed(2),
          })
        ),
      },
      {
        label: t('fittings.stats.fact.jumpFuel'),
        value: figure((x) =>
          t('fittings.stats.unit.fuelPerLightYear', {
            value: (x.jumpDrive?.fuelPerLightYear ?? 0).toFixed(0),
            fuel: typeName(fuelTypeId),
          })
        ),
      }
    );
  }
  return facts;
}
