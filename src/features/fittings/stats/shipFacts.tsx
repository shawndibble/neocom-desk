import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { FittingStats } from '@/engine/fittings/types';
import { Facts, StatNote } from '../StatFacts';
import { kmValue } from '../rangeText';
import { budgetFigure, makeFigure } from './statFigures';
import { resourceFacts } from './resourceFacts';
import { unknownItemsList } from './unknownItemsList';

interface FactsProps {
  stats: FittingStats;
}

interface TypeNameProps extends FactsProps {
  typeName: (typeId: number) => string;
}

/** Drones section body: DPS, bandwidth, bay, active count and control range. */
export function DroneFacts({ stats }: FactsProps) {
  const { t } = useTranslation();
  const figure = makeFigure(stats);
  return (
    <Facts
      items={[
        {
          label: t('fittings.stats.fact.droneDps'),
          value: figure((s) => s.droneDps.toFixed(1)),
        },
        {
          label: t('fittings.stats.fact.bandwidth'),
          value: figure((s) =>
            t('fittings.stats.unit.bandwidth', {
              used: s.droneBandwidthUsed.toFixed(0),
              total: s.droneBandwidthTotal.toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.droneBay'),
          value: figure((s) =>
            t('fittings.stats.unit.cubicMetres', {
              value: s.droneCapacity.toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.maxActiveDrones'),
          value: figure((s) => String(s.maxActiveDrones)),
        },
        {
          label: t('fittings.stats.fact.droneControlRange'),
          value: figure((s) =>
            t('fittings.stats.unit.km', { value: kmValue(s.applied.droneControlRange) })
          ),
        },
      ]}
    />
  );
}

/** Fighters section body: DPS, launch tubes and bay. */
export function FighterFacts({ stats }: FactsProps) {
  const { t } = useTranslation();
  const figure = makeFigure(stats);
  return (
    <Facts
      items={[
        {
          label: t('fittings.stats.fact.fighterDps'),
          value: figure((s) => s.fighters.dps.toFixed(1)),
        },
        {
          label: t('fittings.stats.fact.fighterTubes'),
          value: figure((s) =>
            t('fittings.stats.unit.usedOfTotal', {
              used: s.fighters.tubes.used.toFixed(0),
              total: s.fighters.tubes.total.toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.fighterBay'),
          value: figure((s) =>
            t('fittings.stats.unit.cubicMetresUsed', {
              used: s.fighters.bay.used.toFixed(0),
              total: s.fighters.bay.total.toFixed(0),
            })
          ),
        },
      ]}
    />
  );
}

/** Navigation section body: speed, align time, agility, mass and warp. */
export function NavigationFacts({ stats }: FactsProps) {
  const { t } = useTranslation();
  const figure = makeFigure(stats);
  return (
    <Facts
      items={[
        {
          label: t('fittings.stats.fact.maxVelocity'),
          value: figure((s) =>
            t('fittings.stats.maxVelocityMeta', {
              value: s.navigation.maxVelocity.toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.align'),
          value: figure((s) =>
            t('fittings.stats.unit.seconds', {
              value: alignTimeSeconds(s.navigation.mass, s.navigation.agility).toFixed(1),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.agility'),
          value: figure((s) => s.navigation.agility.toFixed(3)),
        },
        {
          label: t('fittings.stats.fact.mass'),
          value: figure((s) =>
            t('fittings.stats.unit.tonnes', {
              value: (s.navigation.mass / 1000).toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.warpSpeed'),
          value: figure((s) =>
            t('fittings.stats.unit.auPerSecond', {
              value: s.navigation.warpSpeed.toFixed(1),
            })
          ),
        },
      ]}
    />
  );
}

/** Targeting section body: range, locked targets, scan resolution and signature. */
export function TargetingFacts({ stats }: FactsProps) {
  const { t } = useTranslation();
  const figure = makeFigure(stats);
  return (
    <Facts
      items={[
        {
          label: t('fittings.stats.fact.targetRange'),
          value: figure((s) =>
            t('fittings.stats.unit.km', {
              value: kmValue(s.targeting.maxTargetRange),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.lockedTargets'),
          value: figure((s) =>
            s.lockedTargets.ship === s.lockedTargets.pilot
              ? String(s.targeting.maxLockedTargets)
              : t('fittings.stats.lockedTargetsValue', { ...s.lockedTargets })
          ),
        },
        {
          label: t('fittings.stats.fact.scanResolution'),
          value: figure((s) =>
            t('fittings.stats.unit.mm', {
              value: s.targeting.scanResolution.toFixed(0),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.signature'),
          value: figure((s) =>
            t('fittings.stats.unit.metres', {
              value: s.targeting.signatureRadius.toFixed(0),
            })
          ),
        },
      ]}
    />
  );
}

/** Fitting section body: CPU, powergrid and calibration against the hull, then holds and sensors. */
export function FittingBudgetFacts({ stats, typeName }: TypeNameProps) {
  const { t } = useTranslation();
  const figure = makeFigure(stats);
  return (
    <>
      <Facts
        items={[
          {
            label: t('fittings.stats.fact.cpu'),
            value: budgetFigure(figure, 'cpu', stats.cpuUsed, stats.cpuTotal, (s) =>
              t('fittings.stats.unit.usedOfTotal', {
                used: s.cpuUsed.toFixed(1),
                total: s.cpuTotal.toFixed(1),
              })
            ),
          },
          {
            label: t('fittings.stats.fact.powergrid'),
            value: budgetFigure(
              figure,
              'powergrid',
              stats.powergridUsed,
              stats.powergridTotal,
              (s) =>
                t('fittings.stats.unit.usedOfTotal', {
                  used: s.powergridUsed.toFixed(1),
                  total: s.powergridTotal.toFixed(1),
                })
            ),
          },
          {
            label: t('fittings.stats.fact.calibration'),
            value: budgetFigure(
              figure,
              'calibration',
              stats.calibrationUsed,
              stats.calibrationTotal,
              (s) =>
                t('fittings.stats.unit.usedOfTotal', {
                  used: s.calibrationUsed.toFixed(0),
                  total: s.calibrationTotal.toFixed(0),
                })
            ),
          },
          ...resourceFacts(stats, figure, typeName, t),
        ]}
      />
      {stats.unknownItemTypeIds.length > 0 && (
        <StatNote tone="warning">
          {/* Which items, one per line — on hover, focus or a tap. */}
          <HintText content={unknownItemsList(stats.unknownItemTypeIds, typeName, t)}>
            {t('fittings.stats.unknownItems', { count: stats.unknownItemTypeIds.length })}
          </HintText>
        </StatNote>
      )}
    </>
  );
}
