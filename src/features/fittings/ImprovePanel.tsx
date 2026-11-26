import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnloadedWeapons } from '@/engine/fittings/improve';
import type { ImproveGoal, ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improve';
import type { Resource } from '@/engine/fittings/makeItFit';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting } from '@/engine/fittings/types';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
import { ImproveSkillsSlotContext } from './improveSkillsSlot';
import { ImproveFixFirst } from './ImproveFixFirst';
import { ImproveGoalPicker } from './ImproveGoalPicker';
import { ImproveNothingFound } from './ImproveNothingFound';
import { ImproveResults } from './ImproveResults';
import { ImproveSearchStatus } from './ImproveSearchStatus';
import { ImproveUnloadedNotices } from './ImproveUnloadedNotices';
import { ImproveSettingsPanel } from './ImproveSettingsPanel';
import { ImproveSidesLine } from './ImproveSidesLine';
import type { ImproveSettings } from './improveSettings';
import type { ImproveSearch } from './useImprove';
import { hasImproveResults } from './improveHasResults';
import { useImproveLabels } from './useImproveLabels';
import { useImprovePanels } from './useImprovePanels';
import { useImproveSelection } from './useImproveSelection';
import { useSelectionCheck } from './useSelectionCheck';
import { useSelectionPreview } from './useSelectionPreview';
import type { FittingCatalogue } from './useFittingCatalogue';

export type { ImproveSettings };

interface Props {
  goal: ImproveGoal;
  onGoalChange: (goal: ImproveGoal) => void;
  search: ImproveSearch;
  catalogue: FittingCatalogue | null;
  onApply: (options: ImproveOption[]) => void;
  renderFlyableImplants?: (fix: RejectedOption, label: string) => ReactNode;
  settings: ImproveSettings;
  onFixFirst: (resource: Resource) => void;
  unloaded?: UnloadedWeapons | null;
  onLoadBestCrystal?: () => void;
  onLoadBestCharge?: () => void;
  freeSections?: ReactNode;
  fitting?: Fitting | null;
  target?: TargetProfile;
  onPreview?: (delta: FittingStatsDelta | null, iskDelta?: number | null) => void;
  footerTarget?: HTMLElement | null;
}

export function ImprovePanel({
  goal,
  onGoalChange,
  search,
  catalogue,
  onApply,
  renderFlyableImplants,
  settings,
  onFixFirst,
  unloaded,
  onLoadBestCrystal,
  onLoadBestCharge,
  freeSections,
  fitting,
  target,
  onPreview,
  footerTarget,
}: Props) {
  const { t } = useTranslation();
  const panels = useImprovePanels(goal);
  const { state, before, hull } = search;
  const result = state.status === 'done' ? state.result : null;
  const labels = useImproveLabels(catalogue);
  const makeoverRows = state.status === 'done' ? state.makeover?.options : undefined;
  const selection = useImproveSelection(result, labels.swapLabel, makeoverRows);
  const { chosen, ticked, hovered, setTicked } = selection;
  const check = useSelectionCheck({
    search,
    fitting,
    target,
    iskBudget: settings.value.iskBudget,
    chosen,
  });
  const listedKeys = useMemo(
    () =>
      state.status === 'done'
        ? new Set(
            [
              ...state.result.makeFlyable,
              ...state.result.noDownside,
              ...state.result.tradeOffs,
              ...(state.makeover?.options ?? []),
            ].map(optionKey)
          )
        : new Set<string>(),
    [state]
  );
  const tickedCovers = chosen.filter((pick) => !listedKeys.has(optionKey(pick)));
  useSelectionPreview({
    recalc: search.recalc,
    fitting,
    before: state.status === 'done' ? state.before : null,
    chosen,
    ticked,
    hovered,
    checked: check.checked,
    onPreview,
  });

  if (state.status === 'overBudget')
    return <ImproveFixFirst resources={state.resources} onFixFirst={onFixFirst} />;

  const pickGoal = (id: ImproveGoal) => {
    if (goal === id) return;
    setTicked(new Map());
    onGoalChange(id);
  };

  return (
    <div className="space-y-4">
      <ImproveGoalPicker
        goal={goal}
        onPick={pickGoal}
        before={before}
        hull={hull}
        settings={settings}
        goalsOpen={panels.goalsOpen}
        goalsId={panels.goalsId}
        onToggleGoals={panels.toggleGoals}
      />

      <ImproveSettingsPanel
        goal={goal}
        settings={settings}
        settingsOpen={panels.settingsOpen}
        settingsId={panels.settingsId}
        onToggleSettings={() => panels.togglePanel('settings')}
        moreOpen={panels.moreOpen}
        moreId={panels.moreId}
        onToggleMore={panels.toggleMore}
        skillsOpen={panels.skillsOpen}
        skillsId={panels.skillsId}
        skillsTriggerRef={panels.setSkillsTrigger}
        skillsPanelRef={panels.setSkillsPanel}
      />

      <ImproveUnloadedNotices
        unloaded={unloaded}
        onLoadBestCharge={onLoadBestCharge}
        state={state}
        oreFamily={settings.value.oreFamily}
        onLoadBestCrystal={onLoadBestCrystal}
      />

      <ImproveSearchStatus search={search} />

      <ImproveSkillsSlotContext.Provider
        value={{
          trigger: panels.skillsTrigger,
          panel: panels.skillsPanel,
          open: panels.skillsOpen,
          onToggle: () => panels.togglePanel('skills'),
          panelId: panels.skillsId,
        }}
      >
        {freeSections}
      </ImproveSkillsSlotContext.Provider>

      {state.status === 'done' && search.mutatedKept.kept > 0 && (
        <p className="text-text-dim text-sm" data-testid="improve-mutated-kept">
          {t('fittings.improve.mutatedKept', { count: search.mutatedKept.kept })}
          {search.mutatedKept.unflyable > 0 &&
            ` ${t('fittings.improve.mutatedUnflyable', { count: search.mutatedKept.unflyable })}`}
        </p>
      )}

      {state.status === 'done' && state.sides && (
        <ImproveSidesLine sides={state.sides} neutral={state.neutral} />
      )}

      {state.status === 'done' &&
        (!hasImproveResults(state, { blocked: true }) ? (
          <ImproveNothingFound
            goal={goal}
            result={state.result}
            before={state.before}
            fitTotal={state.fitTotal}
            noModules={fitting?.modules.length === 0}
            settings={settings}
            labels={labels}
            onSearchAgain={search.restart}
            onSearchRework={() => settings.onChange({ reach: 'rework' })}
          />
        ) : (
          <ImproveResults
            state={state}
            goal={goal}
            settings={settings}
            labels={labels}
            selection={selection}
            check={check}
            tickedCovers={tickedCovers}
            target={target}
            renderFlyableImplants={renderFlyableImplants}
            onApply={onApply}
            footerTarget={footerTarget}
          />
        ))}
    </div>
  );
}
