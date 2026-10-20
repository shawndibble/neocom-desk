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

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
        ? figure((s) => t('fittings.stats.weaponDps', { value: s.offense.dps.toFixed(1) }))
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
        figure((s) => t('fittings.stats.weaponDps', { value: s.droneDps.toFixed(1) })),
        stats ? <DroneFacts stats={stats} /> : placeholder
      ),
    stats &&
      stats.fighters.tubes.total > 0 &&
      section(
        'fighters',
        figure((s) => t('fittings.stats.weaponDps', { value: s.fighters.dps.toFixed(1) })),
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
      figure((s) => t('fittings.stats.defenseEhp', { value: formatEhp(s.ehp) })),
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
}: ColumnContext & { price: Appraisal | null }): ReactNode[] {
  const priceInfo = priceView(price, typeName);
  const { nothingPriced, unpriced } = priceInfo;
  return [
    section(
      'capacitor',
      figure(
        (s) =>
          s.capacitor.stable
            ? t('fittings.stats.capacitorStable', {
                pct: s.capacitor.stablePercentage.toFixed(0),
              })
            : t('fittings.stats.capacitorDepletes', {
                time: formatSeconds(s.capacitor.depletesInSeconds),
              }),
        stats ? CAPACITOR_TONE_CLASS[capacitorTone(stats.capacitor)] : undefined
      ),
      stats ? <CapacitorFacts stats={stats} /> : placeholder
    ),
    section(
      'navigation',
      figure((s) =>
        t('fittings.stats.maxVelocityMeta', { value: s.navigation.maxVelocity.toFixed(0) })
      ),
      stats ? <NavigationFacts stats={stats} /> : placeholder
    ),
    section(
      'targeting',
      figure((s) =>
        t('fittings.stats.unit.km', {
          value: kmValue(s.targeting.maxTargetRange),
        })
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
              cpu: pctOf(s.cpuUsed, s.cpuTotal).toFixed(0),
              pg: pctOf(s.powergridUsed, s.powergridTotal).toFixed(0),
              cal: pctOf(s.calibrationUsed, s.calibrationTotal).toFixed(0),
            }
          ),
        stats && !fitsResourceBudget(stats) ? OVER_BUDGET_TONE : undefined
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
            value: s.mining.perSecond.toFixed(1),
          })
        ),
        <MiningFacts stats={stats} typeName={typeName} />
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
      price ? nothingPriced ? '—' : <IskLabel value={price.totals.sell} /> : undefined,
      priceInfo.named ? (
        <PriceBody view={{ ...priceInfo, named: priceInfo.named }} />
      ) : (
        <StatNote>{t('fittings.stats.priceLoading')}</StatNote>
      ),
      unpriced.length > 0 ? t('fittings.stats.incomplete') : undefined
    ),
  ];
}
