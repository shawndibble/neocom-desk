/**
 * Improve's drawer body (scope decision `20261024-171917`): the Improve Goal
 * chips (a goal the fit cannot score is a disabled chip with its reason),
 * the goal's Guardrails as one plain line, then the search — progress with
 * Cancel, "Show best so far" after 10 s — and its results in two sections,
 * No downside and Trade-offs, never ranked against each other. Ticked rows
 * are applied together as one unsaved edit.
 */
import { useMemo, type ReactNode } from 'react';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import type { ImproveGoal, ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
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
  /** The implant alternative under a Make Flyable fix that overran CPU or powergrid; absent: none. */
  renderFlyableImplants?: (fix: RejectedOption, label: string) => ReactNode;
  settings: ImproveSettings;
  /** Opens Make it fit on that budget, from "Fix this first". */
  onFixFirst: (resource: Resource) => void;
  /** Weapons holding no charge, which damage goals can't score; null or absent: none. */
  unloaded?: UnloadedWeapons | null;
  /** Loads Mine more's best crystal into the miners that hold none of the ore's; absent when it cannot. */
  onLoadBestCrystal?: () => void;
  /** Loads the best charge into each empty weapon group; absent when none can be loaded. */
  onLoadBestCharge?: () => void;
  /** Train and Implants, which cost the fit nothing and sit above the swaps; none for an over-budget fit. */
  freeSections?: ReactNode;
  /** The open Fitting, to check the ticked rows together; absent: no combined check. */
  fitting?: Fitting | null;
  /** The page's Target Profile, for the summary's DPS. */
  target?: TargetProfile;
  /**
   * Tells the stats column what the ticked rows, plus the row under the
   * pointer or keyboard focus, would change; null when nothing is previewed.
   */
  onPreview?: (delta: FittingStatsDelta | null, iskDelta?: number | null) => void;
  /** The drawer's footer, where the selection and Apply bar goes; absent: it sticks to the list's bottom. */
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
    iskBudget: settings.iskBudget,
    chosen,
  });
  // Ticked rows that no list shows are covers added from the footer: they get a tick of their own there.
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

  // A fit that doesn't fit has nothing to improve yet: hand over to Make it fit (`20261019-144736`).
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
        oreFamily={settings.oreFamily}
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

      {state.status === 'done' && state.sides && (
        <ImproveSidesLine sides={state.sides} neutral={state.neutral} />
      )}

      {state.status === 'done' &&
        (state.result.makeFlyable.length === 0 &&
        state.result.flyableBlocked.length === 0 &&
        state.result.noDownside.length === 0 &&
        state.result.tradeOffs.length === 0 &&
        state.makeover === undefined ? (
          <ImproveNothingFound
            goal={goal}
            result={state.result}
            before={state.before}
            fitTotal={state.fitTotal}
            noModules={fitting?.modules.length === 0}
            settings={settings}
            labels={labels}
            onSearchAgain={search.restart}
            onSearchRework={() => settings.onReachChange('rework')}
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
