import { Fragment, useRef, useState, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useShipDataNeedsConnection } from './useDogmaEngineStatus';
import { formatSeconds } from '@/lib/duration';
import type {
  Fitting,
  FittingModuleResult,
  FittingStats,
  StatsErrorReason,
} from '@/engine/fittings/types';
import { ResistTable } from './stats/ResistTable';
import { formatEhp } from './stats/resistFormat';
import { resistRows } from './stats/resistRows';
import { fleetBoostsMeta, supportMeta } from './stats/sectionMeta';
import {
  DroneFacts,
  FighterFacts,
  FittingBudgetFacts,
  NavigationFacts,
  TargetingFacts,
} from './stats/shipFacts';
import { PriceBody, IskLabel } from './stats/PriceBody';
import { priceView } from './stats/priceView';
import { OVER_BUDGET_TONE, makeFigure } from './stats/statFigures';
import { OffenseRows } from './stats/OffenseRows';
import { StatSection, YourCharactersSection } from './stats/StatSection';
import type { Appraisal } from '@/engine/market/appraisal';
import type { DogmaAssetProgress } from './dogmaFittingEngine';
import { useDamageProfileName, type DamageProfiles } from './damageProfiles';
import { DamageProfilePicker } from './DamageProfilePicker';
import { AppliedDpsPanel } from './AppliedDpsPanel';
import { StatFields, StatNote } from './StatFacts';
import { SkillOverridesControl } from './SkillOverridesControl';
import { StatsToolbar } from './StatsToolbar';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  isSectionExpanded,
  useStatsSectionsPreference,
  withSectionExpanded,
} from './statsSectionsPreference';
import { CapacitorFacts, TankFacts } from './FittingTankStats';
import { capacitorTone, type CapacitorTone } from './capacitorTone';
import { type GapCharacter } from './useCharacterGaps';
import { SupportFacts } from './FittingSupportStats';
import { MiningFacts } from './FittingMiningStats';
import { FleetBoostFacts } from './FittingFleetBoostStats';
import { hasFleetSupport } from '@/engine/fittings/fleetSupport';
import { ProjectedEffectsPanel } from './ProjectedEffectsPanel';
import { useOverheatAll, useProjectedSources } from './statsConditions';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';
import { kmValue } from './rangeText';
import { AbyssalRunPlanner, AbyssalWeatherMeta, type WeatherCompare } from './AbyssalRunPlanner';
import { useAbyssalWeather, useWeatherName } from './abyssalWeatherSelection';
import { StatsHeadingLabel } from './StatsHeadingLabel';
import { StatsGroupLabel, StatsScopePanel, StatsScopeTrigger } from './StatsScopePanels';
import {
  defaultTacticalMode,
  tacticalModeKind,
  tacticalModesFor,
} from '@/engine/fittings/tacticalModes';
import { fitsResourceBudget, resourceOverage } from '@/engine/fittings/skillGaps';

const CAPACITOR_TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const satisfies Record<CapacitorTone, string>;

/** Stable ids — the remembered layout (`statsSectionsPreference.ts`) is keyed on them. */
type Section =
  | 'assumptions'
  | 'whatToTrain'
  | 'yourCharacters'
  | 'offense'
  | 'appliedDps'
  | 'defense'
  | 'capacitor'
  | 'support'
  | 'mining'
  | 'fleetBoosts'
  | 'projected'
  | 'abyssal'
  | 'targeting'
  | 'navigation'
  | 'drones'
  | 'fighters'
  | 'fitting'
  | 'price';

/** Open at first: what a pilot reads on every fit. The rest is a click away, as in the game window. */
const OPEN_BY_DEFAULT: ReadonlySet<Section> = new Set([
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  // Only there at all when the fit has something to show in it.
  'support',
  'mining',
  'fleetBoosts',
  'navigation',
  'drones',
  'fighters',
]);

interface FittingStatsSectionsProps {
  stats: FittingStats | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  /** What failed, when `statsError`: the pilot's skills, or the ship data / calculation. */
  statsErrorReason?: StatsErrorReason;
  /** False when the pilot's skills could not be read, so the figures assume none. Default true. */
  skillsKnown?: boolean;
  /** Tries the failed load again; without it the error has no retry. */
  onRetry?: () => void;
  price: Appraisal | null;
  /** Names an Offense row's weapon, charge or drone. */
  typeName: (typeId: number) => string;
  damageProfiles: DamageProfiles;
  targetProfiles: TargetProfiles;
  /** A saved Fitting to overlay on the applied-DPS graphs; absent without a Character. */
  overlay?: OverlayFitting;
  /**
   * Who flies it, for the Pilot trigger and panel. Absent: no Character, so
   * the trigger reads the skills basis alone (All skills V).
   */
  pilot?: {
    /** Null while it loads. */
    characterName: string | null;
    /** Skills the Character lacks for the fit: "· N missing" on the trigger. */
    missingSkills?: number;
    /** The fit's skill requirements could not be read. */
    skillsUnknown?: boolean;
    /** Top of the Pilot panel: the missing-skills chip, the skills-unknown note. */
    notes?: ReactNode;
  };
  /**
   * The Abyssal weather the figures on screen were worked out in, for the
   * Situation trigger: it lags a new pick until they land. Absent: the
   * session weather.
   */
  statsWeatherTypeId?: number | null;
  /** The Tactical mode picker, top of the Situation panel — absent where the hull has no modes. */
  tacticalMode?: ReactNode;
  /**
   * The Abyssal section — the session weather and a run planned in it
   * (`AbyssalRunPlanner`). Its body mounts only while open, which is what keeps
   * the weather's delta from being worked out while it is shut.
   */
  abyssal?: { hullGroupId: number | undefined; compare: WeatherCompare | null };
  /** The implant controls, grouped with the skills override under "Implants & skills" — absent where a Fitting has no implants to choose. */
  implants?: ReactNode;
  /** "What to train" (`FittingWhatToTrainPanel`) — absent where there's no Character to train. Collapsed by default: it only works anything out once opened. */
  whatToTrain?: ReactNode;
  /** "Your Characters": every Character's gap to this Fitting. Absent with fewer than two Characters. */
  yourCharacters?: readonly GapCharacter[];
  /** The hull takes drones (`showsDrones`) — else there is no Drones section. */
  showDrones?: boolean;
  /**
   * The open Fitting, and its modules' results when they line up with it:
   * with the editor's item actions, each Offense weapon row gets the item
   * menu for its group (change charge, state, show info).
   */
  fitting?: Fitting | null;
  moduleResults?: FittingModuleResult[] | null;
}

/**
 * The stats column (scope decision `20260924-215855`, mockup A): one panel
 * of collapsible sections, each row carrying its headline number, laid out
 * like the game's fitting window. Only the ship's numbers sit in it, under
 * Damage & Tank and Ship labels; who flies it and what it flies in sit behind
 * the Pilot and Situation triggers on top, in side panels (#3978). Every section keeps what its ticket put
 * there — per-weapon offense and heat (#1548), damage profiles and the
 * adapted RAH (#1545), target profiles and applied-DPS graphs (#1546).
 */
export function FittingStatsSections({
  stats,
  statsProgress,
  statsError,
  statsErrorReason = 'shipData',
  skillsKnown = true,
  onRetry,
  price,
  typeName,
  damageProfiles,
  targetProfiles,
  overlay,
  pilot,
  statsWeatherTypeId,
  tacticalMode,
  abyssal,
  implants,
  whatToTrain,
  yourCharacters,
  showDrones = true,
  fitting = null,
  moduleResults = null,
}: FittingStatsSectionsProps) {
  const { t } = useTranslation();
  // The ship data never downloaded and there is no connection to fetch it: say so, not "couldn't load".
  const shipDataNeedsConnection = useShipDataNeedsConnection();
  const profileName = useDamageProfileName()(damageProfiles.selected);
  const priceInfo = priceView(price, typeName);
  const { nothingPriced, unpriced } = priceInfo;
  // A RAH's resists move with the profile (the engine adapts it), so the
  // armor row does too — label that, and show the RAH's own adapted resists.
  const adaptedHardeners = (stats?.modules ?? []).flatMap((module) =>
    module.adaptedResonances ? [module.adaptedResonances] : []
  );
  // Which sections are open is the pilot's own layout, kept on this device
  // (`statsSectionsPreference.ts`); an untouched one opens as OPEN_BY_DEFAULT
  // says on desktop and starts collapsed on a phone.
  const isPhone = useIsPhone();
  const storedSections = useStatsSectionsPreference((state) => state.value);
  const setSections = useStatsSectionsPreference((state) => state.setValue);
  useHydratedStore(useStatsSectionsPreference);
  const isExpanded = (section: Section) =>
    isSectionExpanded(storedSections, section, {
      isPhone,
      openByDefault: OPEN_BY_DEFAULT.has(section),
    });
  const projectedShips = useProjectedSources((state) =>
    state.sources.reduce((sum, source) => sum + source.count, 0)
  );
  // One panel at a time: both slide over the same edge.
  const [panel, setPanel] = useState<'pilot' | 'situation' | null>(null);
  // The panel last opened: what the closing panel shows, and whose trigger
  // takes focus back when the opener is gone (a phone/desktop swap mid-open).
  const [shownPanel, setShownPanel] = useState<'pilot' | 'situation'>('pilot');
  const openPanel = (which: 'pilot' | 'situation') => {
    setShownPanel(which);
    setPanel(which);
  };
  const closePanel = () => setPanel(null);
  const pilotTriggerRef = useRef<HTMLButtonElement>(null);
  const situationTriggerRef = useRef<HTMLButtonElement>(null);
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  const sessionWeather = useAbyssalWeather((state) => state.weatherTypeId);
  const weatherName = useWeatherName(
    statsWeatherTypeId === undefined ? sessionWeather : statsWeatherTypeId
  );
  // A Fitting in its hull's default mode carries no `mode` (TacticalModePicker's `withMode`).
  const mode =
    fitting?.mode !== undefined &&
    tacticalModesFor(fitting.shipTypeId).includes(fitting.mode) &&
    fitting.mode !== defaultTacticalMode(fitting.shipTypeId)
      ? tacticalModeKind(fitting.mode)
      : undefined;

  // What each trigger carries with its panel shut: skill gaps only (the
  // Character and skills basis read in the Pilot panel, so the trigger fits
  // one line on a phone); the weather, a non-default Tactical mode,
  // projected ships and overheat.
  const pilotWarnings = [
    pilot?.missingSkills && t('fittings.stats.pilot.missing', { count: pilot.missingSkills }),
    (pilot?.skillsUnknown || (stats && !skillsKnown)) && t('fittings.stats.pilot.skillsUnknown'),
  ].filter(Boolean);
  const pilotValue =
    pilotWarnings.length > 0 ? (
      <span className="text-warning">{pilotWarnings.join(' · ')}</span>
    ) : null;
  const situationValue = (
    <>
      {[
        weatherName ?? t('fittings.weather.none'),
        mode && t(`fittings.mode.kind.${mode}`),
        projectedShips > 0 && t('fittings.stats.situation.projected', { count: projectedShips }),
      ]
        .filter(Boolean)
        .join(' · ')}
      {overheatAll && (
        <span className="text-warning"> · {t('fittings.stats.situation.overheated')}</span>
      )}
    </>
  );
  const toggle = (section: Section) =>
    // From the store's current value, never this render's possibly stale copy.
    void setSections(
      withSectionExpanded(
        useStatsSectionsPreference.getState().value,
        section,
        !isExpanded(section)
      )
    );

  const downloadPct =
    statsProgress?.totalBytes && statsProgress.totalBytes > 0
      ? Math.round((statsProgress.loadedBytes / statsProgress.totalBytes) * 100)
      : null;

  // The error is said once, above the sections; each section just says it has nothing.
  const placeholder = statsError ? (
    <StatNote>{t('fittings.stats.unavailable')}</StatNote>
  ) : (
    <StatNote>
      {downloadPct === null
        ? t('fittings.stats.loadingIndeterminate')
        : t('fittings.stats.loading', { pct: downloadPct })}
    </StatNote>
  );

  const pctOf = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

  const figure = makeFigure(stats);

  function section(
    id: Section,
    meta: ReactNode,
    body: ReactNode,
    warning?: string,
    /** `h3` for a section in a side panel, under the panel's own title. */
    level: 'h3' | 'h4' = 'h4'
  ) {
    return (
      <StatSection
        key={id}
        title={t(`fittings.stats.section.${id}`)}
        meta={meta}
        warning={warning}
        expanded={isExpanded(id)}
        onToggle={() => toggle(id)}
        level={level}
      >
        {body}
      </StatSection>
    );
  }

  /** A column group: its label over the sections it shows, nothing when it shows none. */
  function group(id: 'damageTank' | 'ship', sections: ReactNode[]) {
    const shown = sections.filter(Boolean);
    if (shown.length === 0) return null;
    return (
      <Fragment key={id}>
        <StatsGroupLabel>{t(`fittings.stats.group.${id}`)}</StatsGroupLabel>
        {shown}
      </Fragment>
    );
  }

  const damageSections = [
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
  const tankSections = [
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
  const shipSections = [
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

  return (
    <div className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <StatsScopeTrigger
          ref={pilotTriggerRef}
          label={t('fittings.stats.pilot.label')}
          open={panel === 'pilot'}
          onClick={() => openPanel('pilot')}
        >
          {pilotValue}
        </StatsScopeTrigger>
        <StatsScopeTrigger
          ref={situationTriggerRef}
          label={t('fittings.stats.situation.label')}
          open={panel === 'situation'}
          onClick={() => openPanel('situation')}
        >
          {situationValue}
        </StatsScopeTrigger>
      </div>
      {statsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-danger"
        >
          <span>
            {t(
              statsErrorReason === 'skills'
                ? 'fittings.stats.errorSkills'
                : shipDataNeedsConnection
                  ? 'fittings.stats.errorOffline'
                  : 'fittings.stats.error'
            )}
          </span>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              {t('fittings.stats.retry')}
            </Button>
          )}
        </div>
      )}

      {stats && !skillsKnown && (
        <p className="border-b border-line px-3 py-2 text-xs text-warning">
          {t('fittings.stats.skillsUnknown')}
        </p>
      )}

      {group('damageTank', [...damageSections, ...tankSections])}
      {group('ship', shipSections)}

      {/* One panel, its content switched by `panel`: swapping two open
        panels would remount it, sending focus back to the first trigger and
        leaving its history entry behind. */}
      <StatsScopePanel
        open={panel !== null}
        onClose={closePanel}
        title={t(
          shownPanel === 'pilot' ? 'fittings.stats.pilot.label' : 'fittings.stats.situation.label'
        )}
        subtitle={
          shownPanel === 'pilot' ? (
            <StatsHeadingLabel
              hasCharacter={pilot !== undefined}
              characterName={pilot?.characterName ?? null}
            />
          ) : (
            t('fittings.stats.situation.subtitle')
          )
        }
        returnFocusFallback={() =>
          (shownPanel === 'pilot' ? pilotTriggerRef : situationTriggerRef).current
        }
      >
        {shownPanel === 'pilot' ? (
          <>
            {pilot?.notes && (
              <div className="space-y-2 border-b border-line px-3 py-2">{pilot.notes}</div>
            )}
            {/* Its sections wait on the stats: say why the panel is bare meanwhile. */}
            {!stats && <div className="px-3 py-2 text-xs">{placeholder}</div>}
            {stats &&
              section(
                'assumptions',
                undefined,
                <StatFields>
                  {implants}
                  <SkillOverridesControl />
                </StatFields>,
                undefined,
                'h3'
              )}
            {stats &&
              whatToTrain &&
              section('whatToTrain', undefined, whatToTrain, undefined, 'h3')}
            {stats && fitting && yourCharacters && (
              <YourCharactersSection
                fitting={fitting}
                characters={yourCharacters}
                render={(meta, body) => section('yourCharacters', meta, body, undefined, 'h3')}
                expanded={isExpanded('yourCharacters')}
              />
            )}
          </>
        ) : (
          <>
            {tacticalMode && (
              <div className="border-b border-line px-3 py-2">
                <StatFields>{tacticalMode}</StatFields>
              </div>
            )}
            {abyssal &&
              section(
                'abyssal',
                <AbyssalWeatherMeta />,
                <AbyssalRunPlanner
                  hullGroupId={abyssal.hullGroupId}
                  compare={abyssal.compare}
                  typeName={typeName}
                />,
                undefined,
                'h3'
              )}
            {section(
              'projected',
              projectedShips > 0
                ? t('fittings.projected.meta', { count: projectedShips })
                : undefined,
              <ProjectedEffectsPanel />,
              undefined,
              'h3'
            )}
            {stats && <StatsToolbar stats={stats} />}
          </>
        )}
      </StatsScopePanel>
    </div>
  );
}
