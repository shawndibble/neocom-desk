import type { FittingStats } from '@/engine/fittings/types';
import type { Fact } from '../StatFacts';
import type { Figure } from './statFigures';
import { fmt0, fmt1, fmt2 } from './fixedFormat';
import type { Translate } from '@/lib/translate';

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
      value: figure(
        (x) => t('fittings.stats.unit.cubicMetres', { value: fmt0(x.holds.cargo) }),
        undefined,
        ['cargoCapacity']
      ),
    },
  ];
  if (s.holds.fleetHangar > 0)
    facts.push({
      label: t('fittings.stats.fact.fleetHangar'),
      value: figure((x) =>
        t('fittings.stats.unit.cubicMetres', { value: fmt0(x.holds.fleetHangar) })
      ),
    });
  if (s.holds.miningHold > 0)
    facts.push({
      label: t('fittings.stats.fact.miningHold'),
      value: figure((x) =>
        t('fittings.stats.unit.cubicMetres', { value: fmt0(x.holds.miningHold) })
      ),
    });
  if (s.sensor.type !== null)
    facts.push({
      label: t('fittings.stats.fact.sensorStrength'),
      value: figure((x) =>
        t('fittings.stats.unit.sensor', {
          value: fmt1(x.sensor.strength),
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
            value: fmt2(x.jumpDrive?.rangeLightYears ?? 0),
          })
        ),
      },
      {
        label: t('fittings.stats.fact.jumpFuel'),
        value: figure((x) =>
          t('fittings.stats.unit.fuelPerLightYear', {
            value: fmt0(x.jumpDrive?.fuelPerLightYear ?? 0),
            fuel: typeName(fuelTypeId),
          })
        ),
      }
    );
  }
  return facts;
}
