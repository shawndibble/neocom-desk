import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Close } from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { ASSETS_ENDPOINTS, useAppraisalOwnedPref } from '@/features/market/appraisalOwnedPref';
import { useMarketHub } from '@/features/market/hub';
import { useOwnedAtStation, type OwnedScope } from '@/features/market/useOwnedAtStation';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
import { IconButton, Modal, Panel, Toast } from '@/components/ui';
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
 * Improve: `open()` from the stats column's Improve trigger, and the `drawer` (with its
 * Undo toast) to render once in the editor. A `SlideOver` beside the fit on
 * desktop, so the Ring stays steerable; a bottom sheet on a phone.
 */
export function useImproveDrawer({
  workspace,
  fitting,
  catalogue,
  targetProfiles,
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
  /** Desktop: the open panel as a page column, for FittingEditorLayout's `improveColumn`; null when shut or on a phone. */
  column: ReactNode;
  /** Open as that column (desktop). */
  docked: boolean;
  /** The stat changes to preview in the stats column; null when Improve is shut or nothing is ticked or hovered. */
  preview: FittingStatsDelta | null;
  /** What the previewed rows add to the fit's price (buy mode); null when none or not comparable. */
  previewIsk: number | null;
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
  const [previewIsk, setPreviewIsk] = useState<number | null>(null);
  const onPreview = useCallback((delta: FittingStatsDelta | null, isk: number | null = null) => {
    setPreview(delta);
    setPreviewIsk(isk);
  }, []);
  // The Fitting before the last Apply and the one it made, for the toast's Undo; null once it is gone.
  const [undo, setUndo] = useState<{ before: Fitting; applied: Fitting; message: string } | null>(
    null
  );
  // Back to the Start screen closes it, so the next Fitting doesn't open into a search.
  if (fitting === null && isOpen) setIsOpen(false);
  // A later edit (a Ring change while the toast is up) ends the Undo: restoring would discard it.
  const undoable = undo !== null && fitting !== null && sameModules(fitting, undo.applied);
  // What the last implant put in the set was, for its confirmation toast.
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  // A column beside the editor from desktop up; below it (phone and tablet, where the
  // stats are a tab of their own) a sheet.
  const asColumn = useIsDesktop();
  // The column's heading takes focus as it opens, so a keyboard user lands in it;
  // closing gives focus back to what held it (the Improve trigger), as the slide-out used to.
  const columnHeading = useRef<HTMLHeadingElement | null>(null);
  const columnRef = useFitToViewport(isOpen && asColumn);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen || !asColumn) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    columnHeading.current?.focus({ preventScroll: true });
    const column = columnRef.current;
    return () => {
      const back = opener.current;
      opener.current = null;
      // Only when focus was in the column (it goes with it): closed by picking an
      // empty slot, focus is already where the pilot is working.
      const active = document.activeElement;
      const lost = active === null || active === document.body || !!column?.contains(active);
      if (lost && back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [isOpen, asColumn, columnRef]);
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
      onPreview={onPreview}
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

  // Desktop: a column in the page, left of the editor (FittingEditorLayout's
  // `improveColumn`), where the docked browser sits: never over the nav, and the
  // stats stay in view while rows are ticked. Sticky, a viewport tall, with its own
  // scroll and the selection bar below it.
  const column = fitting && isOpen && asColumn && (
    // Escape closes it, as it did the slide-out, from anywhere in it (its heading
    // takes focus on open), unless a dialog opened from it owns the key.
    <div
      ref={columnRef}
      // The class height is the fallback; useFitToViewport sets the real one.
      className="slide-in-left sticky top-3 h-[calc(100vh-1.5rem)]"
      onKeyDown={(event) => {
        // Not one a popup inside it already handled (a Select's list, a tooltip: React
        // bubbles their portalled keys through here), nor one a dialog owns.
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          !event.currentTarget.contains(event.target as Node) ||
          document.querySelector('dialog[open]')
        )
          return;
        close();
      }}
    >
      <Panel
        title={t('fittings.improve.title')}
        headingRef={columnHeading}
        actions={<IconButton icon={<Close />} label={t('common.close')} onClick={close} />}
        padded={false}
        fill
        className="flex h-full flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{body}</div>
        {footer && <div className="border-line shrink-0 border-t px-3 py-2">{footer}</div>}
      </Panel>
    </div>
  );

  const drawer = fitting && (
    <>
      {!asColumn ? (
        <Modal
          open={isOpen}
          onClose={close}
          placement="sheet"
          title={t('fittings.improve.title')}
          footer={footer}
        >
          {body}
        </Modal>
      ) : // Desktop: `column`, a column in the page itself.
      null}
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
  return {
    open,
    close,
    drawer,
    column: column || null,
    docked: isOpen && asColumn,
    preview: isOpen ? preview : null,
    previewIsk: isOpen ? previewIsk : null,
  };
}

/**
 * The column is sticky a viewport tall, but at the top of the page it starts below
 * the editor's header, so a fixed `100vh` height would push its selection bar off
 * the bottom of the screen until the page scrolled. This keeps it ending at the
 * viewport's bottom (0.75rem clear) wherever its top is.
 */
function useFitToViewport(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Before paint, so the first frame already ends at the viewport's bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const top = Math.max(el.getBoundingClientRect().top, 12);
      el.style.height = `${window.innerHeight - top - 12}px`;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Content above it changing height (a charge note, load warnings) moves its top too.
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    resized?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resized?.disconnect();
    };
  }, [active]);
  return ref;
}
