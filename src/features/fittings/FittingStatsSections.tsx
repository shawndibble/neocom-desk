import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { Button } from '@/components/ui';
import { useShipDataNeedsConnection } from './useDogmaEngineStatus';
import type {
  Fitting,
  FittingCargoItem,
  FittingModuleResult,
  FittingStats,
  StatsErrorReason,
} from '@/engine/fittings/types';
import { damageSections, shipSections, tankSections } from './stats/columnSections';
import { makeFigure } from './stats/statFigures';
import { PanelSection, YourCharactersSection } from './stats/StatSection';
import { useSectionBuilder } from './stats/useSectionBuilder';
import type { Appraisal } from '@/engine/market/appraisal';
import type { DogmaAssetProgress } from './dogmaFittingEngine';
import { useDamageProfileName, type DamageProfiles } from './damageProfiles';
import { StatNote, StatFields } from './StatFacts';
import { SkillOverridesControl } from './SkillOverridesControl';
import { StatsToolbar } from './StatsToolbar';
import { type GapCharacter } from './useCharacterGaps';
import { ProjectedEffectsPanel } from './ProjectedEffectsPanel';
import { useOverheatAll, useProjectedSources } from './statsConditions';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';
import { AbyssalRunPlanner, AbyssalWeatherMeta, type WeatherCompare } from './AbyssalRunPlanner';
import { useAbyssalWeather, useWeatherName } from './abyssalWeatherSelection';
import { StatPreviewProvider } from './statPreview';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
import { StatsHeadingLabel } from './StatsHeadingLabel';
import { StatsScopePanel, StatsScopeTrigger } from './StatsScopePanels';
import {
  defaultTacticalMode,
  tacticalModeKind,
  tacticalModesFor,
} from '@/engine/fittings/tacticalModes';

interface FittingStatsSectionsProps {
  stats: FittingStats | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  statsErrorReason?: StatsErrorReason;
  skillsKnown?: boolean;
  onRetry?: () => void;
  price: Appraisal | null;
  typeName: (typeId: number) => string;
  damageProfiles: DamageProfiles;
  targetProfiles: TargetProfiles;
  overlay?: OverlayFitting;
  pilot?: {
    characterName: string | null;
    missingSkills?: number;
    skillsUnknown?: boolean;
    notes?: ReactNode;
    missingSkillsChip?: ReactNode;
  };
  statsWeatherTypeId?: number | null;
  tacticalMode?: ReactNode;
  abyssal?: {
    hullGroupId: number | undefined;
    compare: WeatherCompare | null;
    cargo: readonly FittingCargoItem[];
  };
  implants?: ReactNode;
  implantsNote?: ReactNode;
  whatToTrain?: ReactNode;
  yourCharacters?: readonly GapCharacter[];
  showDrones?: boolean;
  fitting?: Fitting | null;
  moduleResults?: FittingModuleResult[] | null;
  preview?: FittingStatsDelta | null;
  previewIsk?: number | null;
  ruleBreaks?: readonly string[];
  whatToTrainRequested?: boolean;
  onWhatToTrainShown?: () => void;
}

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
  implantsNote,
  whatToTrain,
  yourCharacters,
  showDrones = true,
  ruleBreaks = [],
  whatToTrainRequested,
  onWhatToTrainShown,
  fitting = null,
  moduleResults = null,
  preview = null,
  previewIsk = null,
}: FittingStatsSectionsProps) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const shipDataNeedsConnection = useShipDataNeedsConnection();
  const profileName = useDamageProfileName()(damageProfiles.selected);
  const { section, group } = useSectionBuilder();
  const projectedShips = useProjectedSources((state) =>
    state.sources.reduce((sum, source) => sum + source.count, 0)
  );
  const [panel, setPanel] = useState<'pilot' | 'situation' | null>(null);
  const [shownPanel, setShownPanel] = useState<'pilot' | 'situation'>('pilot');
  const openPanel = (which: 'pilot' | 'situation') => {
    setShownPanel(which);
    setPanel(which);
  };
  const closePanel = () => setPanel(null);
  if (whatToTrainRequested && panel !== 'pilot') openPanel('pilot');
  const scrollToTrain = useRef(false);
  const trainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!whatToTrainRequested) return;
    scrollToTrain.current = true;
    onWhatToTrainShown?.();
  }, [whatToTrainRequested, onWhatToTrainShown]);
  useEffect(() => {
    const el = trainRef.current;
    if (!scrollToTrain.current || !el) return;
    scrollToTrain.current = false;
    el.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });
  const pilotTriggerRef = useRef<HTMLButtonElement>(null);
  const situationTriggerRef = useRef<HTMLButtonElement>(null);
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  const sessionWeather = useAbyssalWeather((state) => state.weatherTypeId);
  const weatherName = useWeatherName(
    statsWeatherTypeId === undefined ? sessionWeather : statsWeatherTypeId
  );
  const mode =
    fitting?.mode !== undefined &&
    tacticalModesFor(fitting.shipTypeId).includes(fitting.mode) &&
    fitting.mode !== defaultTacticalMode(fitting.shipTypeId)
      ? tacticalModeKind(fitting.mode)
      : undefined;

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

  const downloadPct =
    statsProgress?.totalBytes && statsProgress.totalBytes > 0
      ? Math.round((statsProgress.loadedBytes / statsProgress.totalBytes) * 100)
      : null;

  const placeholder = statsError ? (
    <StatNote>{t('fittings.stats.unavailable')}</StatNote>
  ) : (
    <StatNote>
      {downloadPct === null
        ? t('fittings.stats.loadingIndeterminate')
        : t('fittings.stats.loading', { pct: downloadPct })}
    </StatNote>
  );

  const figure = makeFigure(stats);
  const column = { t, section, figure, stats, placeholder, typeName };
  const damage = damageSections({
    ...column,
    targetProfiles,
    overlay,
    showDrones,
    fitting,
    moduleResults,
  });
  const tank = tankSections({ ...column, damageProfiles, profileName });
  const ship = shipSections({ ...column, price, previewIsk });

  return (
    <StatPreviewProvider delta={preview}>
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

        {ruleBreaks.length > 0 && (
          <div
            data-testid="rule-breaks"
            className="space-y-1 border-b border-line px-3 py-2 text-xs"
          >
            <ul className="space-y-0.5 text-warning">
              {ruleBreaks.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-text-dim">{t('fittings.ruleBreak.statsCountAll')}</p>
          </div>
        )}

        {group('damageTank', [...damage, ...tank])}
        {group('ship', ship)}

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
              {!stats && <div className="px-3 py-2 text-xs">{placeholder}</div>}
              {stats && (
                <div className="space-y-2 border-b border-line px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    {implants}
                    <SkillOverridesControl />
                  </div>
                  {implantsNote}
                </div>
              )}
              {pilot?.missingSkillsChip && (
                <div className="border-b border-line px-3 py-2">{pilot.missingSkillsChip}</div>
              )}
              {stats && whatToTrain && (
                <PanelSection id="whatToTrain" title={t('fittings.stats.section.whatToTrain')}>
                  <div ref={trainRef}>{whatToTrain}</div>
                </PanelSection>
              )}
              {stats && fitting && yourCharacters && (
                <YourCharactersSection
                  fitting={fitting}
                  characters={yourCharacters}
                  render={(meta, body) => (
                    <PanelSection
                      id="yourCharacters"
                      title={t('fittings.stats.section.yourCharacters')}
                      meta={meta}
                    >
                      {body}
                    </PanelSection>
                  )}
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
                    cargo={abyssal.cargo}
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
    </StatPreviewProvider>
  );
}
