import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { FittingStats } from '@/engine/fittings/types';
import { Facts, StatNote } from '../StatFacts';
import { kmValue } from '../rangeText';
import { budgetFigure, makeFigure } from './statFigures';
import { resourceFacts } from './resourceFacts';
import { unknownItemsList } from './unknownItemsList';
import { fmt0, fmt1, fmt3 } from './fixedFormat';

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
          value: figure((s) => fmt1(s.droneDps), undefined, ['droneDps']),
        },
        {
          label: t('fittings.stats.fact.bandwidth'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.bandwidth', {
                used: fmt1(s.droneBandwidthUsed),
                total: fmt1(s.droneBandwidthTotal),
              }),
            undefined,
            ['droneBandwidthUsed', 'droneBandwidthTotal']
          ),
        },
        {
          label: t('fittings.stats.fact.droneBay'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.cubicMetres', {
                value: fmt0(s.droneCapacity),
              }),
            undefined,
            ['droneCapacity']
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
          value: figure((s) => fmt1(s.fighters.dps)),
        },
        {
          label: t('fittings.stats.fact.fighterTubes'),
          value: figure((s) =>
            t('fittings.stats.unit.usedOfTotal', {
              used: fmt0(s.fighters.tubes.used),
              total: fmt0(s.fighters.tubes.total),
            })
          ),
        },
        {
          label: t('fittings.stats.fact.fighterBay'),
          value: figure((s) =>
            t('fittings.stats.unit.cubicMetresUsed', {
              used: fmt0(s.fighters.bay.used),
              total: fmt0(s.fighters.bay.total),
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
          value: figure(
            (s) =>
              t('fittings.stats.maxVelocityMeta', {
                value: fmt0(s.navigation.maxVelocity),
              }),
            undefined,
            ['maxVelocity']
          ),
        },
        {
          label: t('fittings.stats.fact.align'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.seconds', {
                value: fmt1(alignTimeSeconds(s.navigation.mass, s.navigation.agility)),
              }),
            undefined,
            ['agility', 'mass']
          ),
        },
        {
          label: t('fittings.stats.fact.agility'),
          value: figure((s) => fmt3(s.navigation.agility), undefined, ['agility']),
        },
        {
          label: t('fittings.stats.fact.mass'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.tonnes', {
                value: fmt0(s.navigation.mass / 1000),
              }),
            undefined,
            ['mass']
          ),
        },
        {
          label: t('fittings.stats.fact.warpSpeed'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.auPerSecond', {
                value: fmt1(s.navigation.warpSpeed),
              }),
            undefined,
            ['warpSpeed']
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
          value: figure(
            (s) =>
              t('fittings.stats.unit.km', {
                value: kmValue(s.targeting.maxTargetRange),
              }),
            undefined,
            ['maxTargetRange']
          ),
        },
        {
          label: t('fittings.stats.fact.lockedTargets'),
          value: figure(
            (s) =>
              s.lockedTargets.ship === s.lockedTargets.pilot
                ? String(s.targeting.maxLockedTargets)
                : t('fittings.stats.lockedTargetsValue', { ...s.lockedTargets }),
            undefined,
            ['maxLockedTargets']
          ),
        },
        {
          label: t('fittings.stats.fact.scanResolution'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.mm', {
                value: fmt0(s.targeting.scanResolution),
              }),
            undefined,
            ['scanResolution']
          ),
        },
        {
          label: t('fittings.stats.fact.signature'),
          value: figure(
            (s) =>
              t('fittings.stats.unit.metres', {
                value: fmt0(s.targeting.signatureRadius),
              }),
            undefined,
            ['signatureRadius']
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
            value: budgetFigure(
              figure,
              'cpu',
              stats.cpuUsed,
              stats.cpuTotal,
              (s) =>
                t('fittings.stats.unit.usedOfTotal', {
                  used: fmt1(s.cpuUsed),
                  total: fmt1(s.cpuTotal),
                }),
              ['cpuUsed', 'cpuTotal']
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
                  used: fmt1(s.powergridUsed),
                  total: fmt1(s.powergridTotal),
                }),
              ['powergridUsed', 'powergridTotal']
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
                  used: fmt0(s.calibrationUsed),
                  total: fmt0(s.calibrationTotal),
                }),
              ['calibrationUsed', 'calibrationTotal']
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
