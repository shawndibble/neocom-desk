import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SlideOver, Toast, useTimedToast } from '@/components/ui';
import {
  applyImproveCandidate,
  type DefenseChoice,
  type ImproveGoal,
  type ImproveOption,
} from '@/engine/fittings/improve';
import { overBudgetResources } from '@/engine/fittings/improveFree';
import { hullRoleOf, rememberedGoal } from '@/engine/fittings/improveRole';
import { loadBestCharges, unloadedWeapons } from '@/engine/fittings/improveCharges';
import type { Fitting, FittingModuleResult } from '@/engine/fittings/types';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
import type { FittingContext } from './fittingContext';
import { useChargeChoices } from './useChargeChoices';
import type { ChargeLoading } from './useChargeLoading';
import { ImproveImplants } from './ImproveImplants';
import { ImprovePanel } from './ImprovePanel';
import { ImproveTrain } from './ImproveTrain';
import type { FitResource } from './makeItFitContext';
import type { TargetProfiles } from './targetProfiles';
import type { FittingCatalogue } from './useFittingCatalogue';
import {
  useImprove,
  useImproveGoal,
  useImproveGoalByRole,
  hullOf,
  useImproveHold,
  useImproveMode,
  useImproveOre,
  useImproveReach,
  useImproveSort,
  useImproveBudget,
  useImproveRefitCap,
  migrateSpendCap,
} from './useImprove';
import type { FittingWorkspace } from './useFittingWorkspace';

const moduleKey = (f: Fitting) =>
  f.modules.map((m) => `${m.slot}${m.slotIndex}:${m.typeId}:${m.chargeTypeId ?? ''}`).join();
const sameModules = (a: Fitting, b: Fitting) => a === b || moduleKey(a) === moduleKey(b);

interface UseImproveDrawerArgs {
  workspace: FittingWorkspace;
  /** Null on the Start screen, where there is nothing to improve. */
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  targetProfiles: TargetProfiles;
  isPhone: boolean;
  edit: FittingWorkspace['edit'];
  /** The active Character, for Train; null shows no Train section. */
  characterId: number | null;
  /** Loads charges, for "Load best charge". */
  charges: ChargeLoading;
  /** The Fitting's calculation, for the Charge Picker's figures; null while it loads. */
  context: FittingContext | null;
  moduleResults: FittingModuleResult[] | null;
  /** Opens Make it fit on a budget, for "Fix this first". */
  openMakeItFit: (resource: FitResource) => void;
}

/**
 * Improve: `open()` from the header's ⋮ menu, and the `drawer` (with its
 * Undo toast) to render once in the editor. A `SlideOver` beside the fit on
 * desktop, so the Ring stays steerable; a bottom sheet on a phone.
 */
export function useImproveDrawer({
  workspace,
  fitting,
  catalogue,
  targetProfiles,
  isPhone,
  edit,
  characterId,
  charges,
  context,
  moduleResults,
  openMakeItFit,
}: UseImproveDrawerArgs): {
  open: () => void;
  drawer: ReactNode;
  /** The stat changes to preview in the stats column; null when Improve is shut or nothing is ticked or hovered. */
  preview: FittingStatsDelta | null;
} {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const legacyGoal = useImproveGoal((state) => state.value);
  const goalsByRole = useImproveGoalByRole((state) => state.value);
  const setGoalsByRole = useImproveGoalByRole((state) => state.setValue);
  // One remembered goal per hull role: a Hulk does not start on the Drake's More damage.
  const role = hullRoleOf(hullOf(fitting, catalogue));
  const goal = rememberedGoal(goalsByRole, legacyGoal, role);
  const setGoal = (next: ImproveGoal) => setGoalsByRole({ ...goalsByRole, [role]: next });
  const reach = useImproveReach((state) => state.value);
  const setReach = useImproveReach((state) => state.setValue);
  const sort = useImproveSort((state) => state.value);
  const setSort = useImproveSort((state) => state.setValue);
  const mode = useImproveMode((state) => state.value);
  const setMode = useImproveMode((state) => state.setValue);
  const oreFamily = useImproveOre((state) => state.value);
  const setOreFamily = useImproveOre((state) => state.setValue);
  const hold = useImproveHold((state) => state.value);
  const setHold = useImproveHold((state) => state.setValue);
  // Planning's budget and Refitting's cap are separate settings; the field shows the mode's own.
  const budget = useImproveBudget((state) => state.value);
  const setBudget = useImproveBudget((state) => state.setValue);
  const refitCap = useImproveRefitCap((state) => state.value);
  const setRefitCap = useImproveRefitCap((state) => state.setValue);
  const spendCap = mode === 'buy' ? budget : refitCap;
  const setSpendCap = mode === 'buy' ? setBudget : setRefitCap;
  useEffect(() => {
    void migrateSpendCap();
  }, []);
  // Not remembered: a Defense Choice, and the Rigs and Officer ticks, are about this fit.
  const [defense, setDefense] = useState<DefenseChoice>('keep');
  const [includeRigs, setIncludeRigs] = useState(false);
  const [includeOfficer, setIncludeOfficer] = useState(false);
  // What the ticked and hovered rows would change, for the stats column; never part of the Fitting or its history.
  const [preview, setPreview] = useState<FittingStatsDelta | null>(null);
  // The Fitting before the last Apply and the one it made, for the toast's Undo; null once it is gone.
  const [undo, setUndo] = useState<{ before: Fitting; applied: Fitting; message: string } | null>(
    null
  );
  // Back to the Start screen closes it, so the next Fitting doesn't open into a search.
  if (fitting === null && isOpen) setIsOpen(false);
  // A later edit (a Ring change while the toast is up) ends the Undo: restoring would discard it.
  const undoable = undo !== null && fitting !== null && sameModules(fitting, undo.applied);
  // What the last implant put in the set was, for its confirmation toast.
  const [implantApplied, setImplantApplied] = useState<string | null>(null);
  useTimedToast(implantApplied, () => setImplantApplied(null));
  const open = useCallback(() => setIsOpen(true), []);
  const close = () => setIsOpen(false);
  const search = useImprove(
    workspace.variants,
    catalogue,
    goal,
    targetProfiles.hydrated ? targetProfiles.selected : undefined,
    isOpen,
    { reach, mode, spendCap, defense, includeRigs, includeOfficer, oreFamily, hold }
  );

  // The Charge Picker's figures cost one calculation per charge, so only while the drawer is open.
  const { groups: chargeGroups } = useChargeChoices({
    fitting: isOpen ? fitting : null,
    context,
    moduleResults,
  });
  const unloaded = fitting && chargeGroups ? unloadedWeapons(fitting, chargeGroups) : null;
  const chargeSteps = fitting && chargeGroups ? loadBestCharges(fitting, chargeGroups) : [];

  function loadBestCharge() {
    if (!fitting) return;
    const applied = charges.loadSteps(chargeSteps);
    if (applied === null) return;
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.chargesLoaded', {
        // Cargo can run out before every empty weapon is loaded.
        count: applied.modules.filter((m, i) => m.chargeTypeId !== fitting.modules[i]?.chargeTypeId)
          .length,
      }),
    });
  }

  const crystals = search.state.status === 'done' ? search.state.crystals : undefined;
  const crystalSteps = crystals?.unloaded?.steps ?? [];

  function loadBestCrystal() {
    if (!fitting || !crystals?.unloaded) return;
    const applied = charges.loadSteps(crystalSteps);
    if (applied === null) return;
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.crystalsLoaded', { count: crystals.unloaded.count }),
    });
  }

  function apply(options: ImproveOption[]) {
    if (!fitting) return;
    // One edit for every ticked row, so Back undoes them together.
    const applied = options.reduce(
      (acc, option) => applyImproveCandidate(acc, option.candidate),
      fitting
    );
    edit(() => applied);
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.applied', { count: options.length }),
    });
  }

  const body = (
    <ImprovePanel
      goal={search.goal}
      onGoalChange={(next) => void setGoal(next)}
      search={search}
      catalogue={catalogue}
      onApply={apply}
      fitting={fitting}
      target={targetProfiles.hydrated ? targetProfiles.selected : undefined}
      onPreview={setPreview}
      unloaded={unloaded}
      onLoadBestCharge={chargeSteps.length > 0 ? loadBestCharge : undefined}
      onLoadBestCrystal={crystalSteps.length > 0 ? loadBestCrystal : undefined}
      onFixFirst={(resource) => {
        setIsOpen(false);
        openMakeItFit(resource);
      }}
      freeSections={
        // Only once the baseline is known to fit: an over-budget fit shows Fix this first alone.
        fitting &&
        search.before &&
        overBudgetResources(search.before).length === 0 && (
          <>
            <ImproveTrain
              goal={search.goal}
              evaluator={workspace.skillGains}
              characterId={characterId}
              fittingName={fitting.name}
              catalogue={catalogue}
            />
            {workspace.profile && (
              <ImproveImplants
                goal={search.goal}
                open={isOpen}
                implants={{
                  fitting,
                  profile: workspace.profile,
                  basis: workspace.implantBasis,
                  onChange: workspace.setImplantSet,
                }}
                onApplied={(name) =>
                  setImplantApplied(t('fittings.makeItFit.implantsApplied', { names: name }))
                }
              />
            )}
          </>
        )
      }
      settings={{
        reach,
        onReachChange: (next) => void setReach(next),
        sort,
        onSortChange: (next) => void setSort(next),
        mode,
        onModeChange: (next) => void setMode(next),
        spendCap,
        onSpendCapChange: (next) => void setSpendCap(next),
        defense,
        onDefenseChange: setDefense,
        includeRigs,
        onIncludeRigsChange: setIncludeRigs,
        includeOfficer,
        onIncludeOfficerChange: setIncludeOfficer,
        oreFamily,
        onOreFamilyChange: (next) => void setOreFamily(next),
        hold,
        onHoldChange: (next) => void setHold(next),
      }}
    />
  );

  const drawer = fitting && (
    <>
      {isPhone ? (
        <Modal open={isOpen} onClose={close} placement="sheet" title={t('fittings.improve.title')}>
          {body}
        </Modal>
      ) : (
        <SlideOver
          open={isOpen}
          onClose={close}
          side="left"
          // Clears the app's 12rem nav, over the Add column, so the stats stay visible.
          className="md:left-48"
          title={t('fittings.improve.title')}
        >
          {body}
        </SlideOver>
      )}
      {implantApplied !== null && <Toast message={implantApplied} />}
      {undo && undoable && (
        <Toast
          message={undo.message}
          instance={undo}
          undo={{
            label: t('fittings.improve.undo'),
            onUndo: () => {
              const before = undo.before;
              edit(() => before);
              setUndo(null);
            },
          }}
          onClose={() => setUndo(null)}
        />
      )}
    </>
  );
  return { open, drawer, preview: isOpen ? preview : null };
}
