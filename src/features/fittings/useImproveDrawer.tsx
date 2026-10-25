import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { ASSETS_ENDPOINTS, useAppraisalOwnedPref } from '@/features/market/appraisalOwnedPref';
import { useMarketHub } from '@/features/market/hub';
import { useOwnedAtStation, type OwnedScope } from '@/features/market/useOwnedAtStation';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
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
  useImproveCountOwned,
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
  close: () => void;
  drawer: ReactNode;
  /** Open beside the editor (desktop), so the page makes room for it rather than sitting under it. */
  docked: boolean;
  /** The stat changes to preview in the stats column; null when Improve is shut or nothing is ticked or hovered. */
  preview: FittingStatsDelta | null;
} {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  // The container's footer, where the panel puts its selection and Apply bar.
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
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
  // Planning counts what the pilot owns at Appraisal's one shared place pick.
  const countOwned = useImproveCountOwned((state) => state.value);
  const setCountOwned = useImproveCountOwned((state) => state.setValue);
  const ownedPref = useAppraisalOwnedPref((state) => state.value);
  const setOwnedPref = useAppraisalOwnedPref((state) => state.setValue);
  useHydratedStore(useImproveCountOwned, useAppraisalOwnedPref);
  const marketHubId = useMarketHub((state) => state.value);
  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const canCountOwned = !lacksAssets && characterId !== null;
  const counting = mode === 'buy' && countOwned && canCountOwned;
  const ownedPlace: OwnedScope = ownedPref.everywhere
    ? 'all'
    : (ownedPref.stationId ?? (getTradeHub(marketHubId) ?? DEFAULT_TRADE_HUB).stationId);
  const stock = useOwnedAtStation(counting && isOpen, ownedPlace);
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
  const close = useCallback(() => setIsOpen(false), []);
  // The Charge Picker's figures cost one calculation per charge, so only while the drawer is open.
  const { groups: chargeGroups } = useChargeChoices({
    fitting: isOpen ? fitting : null,
    context,
    moduleResults,
  });
  const unloaded = fitting && chargeGroups ? unloadedWeapons(fitting, chargeGroups) : null;
  const chargeSteps = fitting && chargeGroups ? loadBestCharges(fitting, chargeGroups) : [];

  const search = useImprove(
    workspace.variants,
    catalogue,
    goal,
    targetProfiles.hydrated ? targetProfiles.selected : undefined,
    // The first search waits for the stock, so it does not run twice.
    isOpen && !(counting && stock.loading),
    {
      reach,
      mode,
      spendCap,
      defense,
      includeRigs,
      includeOfficer,
      oreFamily,
      hold,
      owned: counting ? stock.owned : null,
    },
    chargeSteps
  );

  const placeLabel = (id: number) =>
    TRADE_HUBS.find((hub) => hub.stationId === id)?.systemName ??
    stock.placeNames.get(id) ??
    t(
      stock.places.find((place) => place.id === id)?.kind === 'station'
        ? 'market.appraisal.minusOwnedUnknownStation'
        : 'market.appraisal.minusOwnedUnknownStructure',
      { id }
    );
  // Trade Hubs are always offered; any other place that holds stock joins them, and so does a saved pick not read yet.
  const otherPlaceIds = [
    ...stock.places.map((place) => place.id),
    ...(ownedPlace === 'all' ? [] : [ownedPlace]),
  ].filter(
    (id, i, ids) => ids.indexOf(id) === i && !TRADE_HUBS.some((hub) => hub.stationId === id)
  );

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
      message: t('fittings.improve.crystalsLoaded', {
        // `accepts` can skip a miner the calculation has not reached yet.
        count: applied.modules.filter((m, i) => m.chargeTypeId !== fitting.modules[i]?.chargeTypeId)
          .length,
      }),
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
      footerTarget={footerTarget}
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
        ...(canCountOwned
          ? {
              owned: {
                on: countOwned,
                onChange: (on: boolean) => void setCountOwned(on),
                place: ownedPlace,
                onPlaceChange: (place: OwnedScope) =>
                  void setOwnedPref(
                    place === 'all'
                      ? { ...ownedPref, everywhere: true }
                      : { ...ownedPref, everywhere: false, stationId: place }
                  ),
                otherPlaces: otherPlaceIds.map((id) => ({ id, label: placeLabel(id) })),
                placeLabel:
                  ownedPlace === 'all'
                    ? t('market.appraisal.minusOwnedEverywhere')
                    : placeLabel(ownedPlace),
              },
            }
          : {}),
      }}
    />
  );

  // Only once a search found something: the bar (ImprovePanel's ImproveFooter) is
  // drawn for results alone, and an empty footer is a stray line.
  const found =
    search.state.status === 'done' &&
    search.state.result.noDownside.length + search.state.result.tradeOffs.length > 0;
  const footer = found && <div ref={setFooterTarget} />;

  const drawer = fitting && (
    <>
      {isPhone ? (
        <Modal
          open={isOpen}
          onClose={close}
          placement="sheet"
          title={t('fittings.improve.title')}
          footer={footer}
        >
          {body}
        </Modal>
      ) : (
        <SlideOver
          open={isOpen}
          onClose={close}
          side="left"
          // Docked beside the app's 12rem nav as the editor's left column: the page
          // makes room (`docked`), so the stats stay visible while rows are ticked.
          className="slide-in-left md:left-48"
          title={t('fittings.improve.title')}
          footer={footer}
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
  return { open, close, drawer, docked: isOpen && !isPhone, preview: isOpen ? preview : null };
}
