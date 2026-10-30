import type { ReactNode } from 'react';
import { formatSeconds } from '@/lib/duration';
import { hasFleetSupport } from '@/engine/fittings/fleetSupport';
import { fitsResourceBudget, resourceOverage } from '@/engine/fittings/skillGaps';
import type { Appraisal } from '@/engine/market/appraisal';
import type { Fitting, FittingModuleResult, FittingStats } from '@/engine/fittings/types';
import { AppliedDpsPanel } from '../AppliedDpsPanel';
import { capacitorTone, type CapacitorTone } from '../capacitorTone';
import { DamageProfilePicker } from '../DamageProfilePicker';
import type { DamageProfiles } from '../damageProfiles';
import { CapacitorFacts, TankFacts } from '../FittingTankStats';
import { FleetBoostFacts } from '../FittingFleetBoostStats';
import { ExploreFacts } from '../FittingExploreStats';
import { MiningFacts } from '../FittingMiningStats';
import { SupportFacts } from '../FittingSupportStats';
import { kmValue } from '../rangeText';
import { StatFields, StatNote } from '../StatFacts';
import type { TargetProfiles } from '../targetProfiles';
import type { OverlayFitting } from '../useOverlayFitting';
import { OffenseRows } from './OffenseRows';
import { IskLabel, PriceBody } from './PriceBody';
import { priceView } from './priceView';
import { formatEhp } from './resistFormat';
import { resistRows } from './resistRows';
import { ResistTable } from './ResistTable';
import { fleetBoostsMeta, supportMeta } from './sectionMeta';
import {
  DroneFacts,
  FighterFacts,
  FittingBudgetFacts,
  NavigationFacts,
  TargetingFacts,
} from './shipFacts';
import { OVER_BUDGET_TONE, type Figure } from './statFigures';
import type { SectionBuilder } from './useSectionBuilder';
import { fmt0, fmt1 } from './fixedFormat';
import type { Translate } from '@/lib/translate';

const CAPACITOR_TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const satisfies Record<CapacitorTone, string>;

const pctOf = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

interface ColumnContext {
  t: Translate;
  section: SectionBuilder;
  figure: Figure;
  stats: FittingStats | null;
  /** What each section says while the stats are not in (the error is said once, above). */
  placeholder: ReactNode;
  typeName: (typeId: number) => string;
}

/** Damage side: Offense, Applied DPS, Drones, Fighters. */
export function damageSections({
  t,
  section,
  figure,
  stats,
  placeholder,
  typeName,
  targetProfiles,
  overlay,
  showDrones,
  fitting,
  moduleResults,
}: ColumnContext & {
  targetProfiles: TargetProfiles;
  overlay?: OverlayFitting;
  showDrones: boolean;
  fitting: Fitting | null;
  moduleResults: FittingModuleResult[] | null;
}): ReactNode[] {
  return [
    section(
      'offense',
      stats && stats.offense.weapons.length > 0
        ? figure((s) => t('fittings.stats.weaponDps', { value: fmt1(s.offense.dps) }), undefined, [
            'totalDps',
          ])
        : undefined,
      stats ? (
        stats.offense.weapons.length > 0 ? (
          <OffenseRows
            stats={stats}
            typeName={typeName}
            fitting={fitting}
            moduleResults={moduleResults}
          />
        ) : stats.offense.chargelessWeaponCount > 0 ? (
          <StatNote>
            {t('fittings.stats.offenseNoCharge', { count: stats.offense.chargelessWeaponCount })}
          </StatNote>
        ) : (
          <StatNote>{t('fittings.stats.offenseNone')}</StatNote>
        )
      ) : (
        placeholder
      )
    ),
    section(
      'appliedDps',
      undefined,
      stats ? (
        <AppliedDpsPanel
          applied={stats.applied}
          unheatedApplied={stats.unheated?.applied ?? null}
          chargelessWeaponCount={stats.offense.chargelessWeaponCount}
          hasSpoolWeapons={stats.offense.weapons.some((row) => row.spool)}
          targetProfiles={targetProfiles}
          overlay={overlay}
        />
      ) : (
        placeholder
      )
    ),
    showDrones &&
      section(
        'drones',
        figure((s) => t('fittings.stats.weaponDps', { value: fmt1(s.droneDps) }), undefined, [
          'droneDps',
        ]),
        stats ? <DroneFacts stats={stats} /> : placeholder
      ),
    stats &&
      stats.fighters.tubes.total > 0 &&
      section(
        'fighters',
        figure((s) => t('fittings.stats.weaponDps', { value: fmt1(s.fighters.dps) })),
        <FighterFacts stats={stats} />
      ),
  ];
}

/** Tank side: Defense, with the damage profile it is read against. */
export function tankSections({
  t,
  section,
  figure,
  stats,
  placeholder,
  typeName,
  damageProfiles,
  profileName,
}: ColumnContext & { damageProfiles: DamageProfiles; profileName: string }): ReactNode[] {
  // A RAH's resists move with the profile (the engine adapts it), so the
  // armor row does too — label that, and show the RAH's own adapted resists.
  const adaptedHardeners = (stats?.modules ?? []).flatMap((module) =>
    module.adaptedResonances ? [module.adaptedResonances] : []
  );
  return [
    section(
      'defense',
      figure((s) => t('fittings.stats.defenseEhp', { value: formatEhp(s.ehp) }), undefined, [
        'ehp',
      ]),
      <>
        <StatFields>
          <DamageProfilePicker damageProfiles={damageProfiles} field />
        </StatFields>
        {stats ? (
          <>
            <ResistTable rows={resistRows(stats, adaptedHardeners, profileName, t)} />
            {adaptedHardeners.length > 0 && (
              <StatNote>{t('fittings.stats.armorIncludesRah', { profile: profileName })}</StatNote>
            )}
            <TankFacts stats={stats} typeName={typeName} />
          </>
        ) : (
          placeholder
        )}
      </>
    ),
  ];
}

/** Ship side: Capacitor, Navigation, Targeting, Fitting, Support, Mining, Fleet boosts, Price. */
export function shipSections({
  t,
  section,
  figure,
  stats,
  placeholder,
  typeName,
  price,
  previewIsk = null,
}: ColumnContext & { price: Appraisal | null; previewIsk?: number | null }): ReactNode[] {
  const priceInfo = priceView(price, typeName);
  const { nothingPriced, unpriced } = priceInfo;
  return [
    section(
      'capacitor',
      figure(
        (s) =>
          s.capacitor.stable
            ? t('fittings.stats.capacitorStable', {
                pct: fmt0(s.capacitor.stablePercentage),
              })
            : t('fittings.stats.capacitorDepletes', {
                time: formatSeconds(s.capacitor.depletesInSeconds),
              }),
        stats ? CAPACITOR_TONE_CLASS[capacitorTone(stats.capacitor)] : undefined,
        ['capacitor']
      ),
      stats ? <CapacitorFacts stats={stats} /> : placeholder
    ),
    section(
      'navigation',
      figure(
        (s) => t('fittings.stats.maxVelocityMeta', { value: fmt0(s.navigation.maxVelocity) }),
        undefined,
        ['maxVelocity']
      ),
      stats ? <NavigationFacts stats={stats} /> : placeholder
    ),
    section(
      'targeting',
      figure(
        (s) =>
          t('fittings.stats.unit.km', {
            value: kmValue(s.targeting.maxTargetRange),
          }),
        undefined,
        ['maxTargetRange']
      ),
      stats ? <TargetingFacts stats={stats} /> : placeholder
    ),
    section(
      'fitting',
      figure(
        (s) =>
          // Calibration earns a place only when it is the one over, or the header would go red with no number to say why.
          t(
            resourceOverage(s.calibrationUsed, s.calibrationTotal) > 0
              ? 'fittings.stats.fittingMetaCalibration'
              : 'fittings.stats.fittingMeta',
            {
              cpu: fmt0(pctOf(s.cpuUsed, s.cpuTotal)),
              pg: fmt0(pctOf(s.powergridUsed, s.powergridTotal)),
              cal: fmt0(pctOf(s.calibrationUsed, s.calibrationTotal)),
            }
          ),
        stats && !fitsResourceBudget(stats) ? OVER_BUDGET_TONE : undefined,
        ['cpuUsed', 'powergridUsed', 'calibrationUsed']
      ),
      stats ? <FittingBudgetFacts stats={stats} typeName={typeName} /> : placeholder,
      stats && stats.unknownItemTypeIds.length > 0 ? t('fittings.stats.incomplete') : undefined
    ),
    stats &&
      stats.support.rows.length > 0 &&
      section(
        'support',
        figure((s) => supportMeta(s, t)),
        <SupportFacts stats={stats} typeName={typeName} />
      ),
    stats &&
      stats.mining.rows.length > 0 &&
      section(
        'mining',
        figure((s) =>
          t('fittings.stats.unit.cubicMetresPerSecond', {
            value: fmt1(s.mining.perSecond),
          })
        ),
        <MiningFacts stats={stats} typeName={typeName} />
      ),
    stats &&
      (stats.explore.modules > 0 || stats.explore.cloakRecalibrationSeconds > 0) &&
      section(
        'exploration',
        // The figure an explorer reads first: what the analyzer hacks at, else what the probes scan at.
        figure((s) =>
          s.explore.hacking.strength > 0
            ? t('fittings.stats.exploration.strengthMeta', {
                value: fmt0(s.explore.hacking.strength),
              })
            : s.explore.probe.strength > 0
              ? t('fittings.stats.exploration.probeMeta', { value: fmt1(s.explore.probe.strength) })
              : ''
        ),
        <ExploreFacts stats={stats} />
      ),
    stats &&
      hasFleetSupport(stats.fleetSupport) &&
      section(
        'fleetBoosts',
        figure((s) => fleetBoostsMeta(s, t)),
        <FleetBoostFacts stats={stats} typeName={typeName} />
      ),
    section(
      'price',
      price ? (
        nothingPriced ? (
          '—'
        ) : previewIsk !== null && previewIsk !== 0 ? (
          <span className={previewIsk < 0 ? 'text-success' : 'text-warning'}>
            <IskLabel value={price.totals.sell} /> →{' '}
            <IskLabel value={price.totals.sell + previewIsk} />
          </span>
        ) : (
          <IskLabel value={price.totals.sell} />
        )
      ) : undefined,
      priceInfo.named ? (
        <PriceBody view={{ ...priceInfo, named: priceInfo.named }} />
      ) : (
        <StatNote>{t('fittings.stats.priceLoading')}</StatNote>
      ),
      unpriced.length > 0 ? t('fittings.stats.incomplete') : undefined
    ),
  ];
}
