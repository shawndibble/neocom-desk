import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { fittingsRedirect } from '@/features/fittings/fittingRoutes';
import { ShipsTabBar } from '@/features/fittings/ShipsTabBar';
import { SHIPS_TABS_ID } from '@/features/fittings/shipsTabs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, LiveStatus } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { AddRow } from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import type { Fitting, FittingSlotKind } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addCargo,
  addDronesWithinBay,
  addModule,
  cargoGroups,
  droneRoom,
  firstFreeSlotIndex,
  newFitting,
  setCargoQuantity,
  swapModuleType,
} from '@/engine/fittings/fittingEdit';
import { FittingAddPanel } from '@/features/fittings/FittingAddPanel';
import { CargoQuantityDialog } from '@/features/fittings/CargoQuantityDialog';
import { FittingItemActionsProvider } from '@/features/fittings/fittingItemActions';
import { useChargeLoading } from '@/features/fittings/useChargeLoading';
import { useEditorItemActions } from '@/features/fittings/useEditorItemActions';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { useEditorShare } from '@/features/fittings/useEditorShare';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { LoadWarnings } from '@/features/fittings/FittingLoadCard';
import { FittingEditorHeader } from '@/features/fittings/FittingEditorHeader';
import { FittingEditorLayout } from '@/features/fittings/FittingEditorLayout';
import { useMakeItFitDialog } from '@/features/fittings/useMakeItFitDialog';
import { useImproveDrawer } from '@/features/fittings/useImproveDrawer';
import type { LibraryAction } from '@/features/fittings/FittingHeader';
import { FittingStartScreen } from '@/features/fittings/FittingStartScreen';
import { FittingLibraryDialogs } from '@/features/fittings/FittingLibraryDialogs';
import { FittingEditorPanes } from '@/features/fittings/FittingEditorPanes';
import { FittingRackSheet } from '@/features/fittings/FittingRackSheet';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { FittingModuleDialog } from '@/features/fittings/FittingModuleDialog';
import { FittingStatsColumn } from '@/features/fittings/FittingStatsColumn';
import { RuleBreakFlags } from '@/features/fittings/ruleBreakFlags';
import { useFittingRuleBreaks } from '@/features/fittings/useFittingRuleBreaks';
import { THREE_COLUMN_QUERY, addModeFor, leftColumn } from '@/features/fittings/fittingLayout';
import { useFittingPasteLoad } from '@/features/fittings/useFittingPasteLoad';
import { useSavedFittingRecord } from '@/features/fittings/useSavedFittingRecord';
import { tacticalModeKind } from '@/engine/fittings/tacticalModes';
import {
  resolveFittingView,
  useFittingViewPreference,
} from '@/features/fittings/fittingViewPreference';
import { useFittingAlpha } from '@/features/fittings/useFittingAlpha';
import { useFittingHardpoints } from '@/features/fittings/useFittingHardpoints';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import { useHullFit } from '@/features/fittings/useHullFit';
import { catalogueTypeName, useFittingCatalogue } from '@/features/fittings/useFittingCatalogue';
import { useFittingContext } from '@/features/fittings/fittingContext';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';
import { useModuleVariations } from '@/features/fittings/useModuleVariations';
import { useOverlayFitting } from '@/features/fittings/useOverlayFitting';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

/**
 * The Fittings section (scope decision `20260924-215855`).
 *
 * With nothing open it is a Start screen: pick a hull to fit from scratch,
 * or Load / open an existing Fitting. With a Fitting open it is the editor:
 * a header (a Fittings menu to open another, then this one's identity and
 * controls), the headline numbers, then three columns as in the game's own
 * window: the module browser (the Add panel), the Ring or List, and the
 * stats sections. Too narrow for all three, the browser becomes a slide-out
 * from the left, opened by an empty slot or "+ Add module"; narrower still
 * (below desktop) it is the mobile layout — Fitting / Stats tabs, Add as a
 * sheet. On a pointer, browser items drag straight onto the Ring.
 */
export function Fittings() {
  const { pathname, search } = useLocation();
  const redirectTo = fittingsRedirect(pathname, search);
  return redirectTo === null ? <FittingsPage /> : <Navigate to={redirectTo} replace />;
}

function FittingsPage() {
  const { t } = useTranslation();
  // Opening Fittings online is intent to use it offline later: fetch the
  // engine now instead of waiting for the idle warm (gated inside).
  useEffect(() => {
    void import('@/sde/warmLazySde')
      .then(({ warmFittingAssets }) => warmFittingAssets())
      .catch(() => {});
  }, []);
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const context = useFittingContext(workspace.profile, catalogue, workspace.chargeBasis);
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const threeColumns = useMediaQuery(THREE_COLUMN_QUERY);
  // The HTML5 drag gate follows the input, not just the width: a touch laptop
  // is wide, but a long-press there belongs to the row menu, not a drag.
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const addMode = addModeFor(threeColumns, isDesktop);
  const [target, setTarget] = useState<AddTarget | null>(null);
  // The slide-out or sheet Add panel is open (the docked one always is).
  // Opened by an empty slot, or by "+ Add module" — which works before the
  // ship data (and so the empty slots) exists.
  const [addOpen, setAddOpen] = useState(false);
  // What the last add did, read out by the sr-only status (the browser stays open beside the Ring).
  const [added, setAdded] = useState({ message: '', n: 0 });
  const setAddedMessage = (message: string) => setAdded((a) => ({ message, n: a.n + 1 }));
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useHydratedStore(useFittingViewPreference);
  const setView = useFittingViewPreference((state) => state.setValue);
  const view = resolveFittingView(storedView, isPhone);
  // Phone Ring: the rack whose slots sheet is open (scope decision `20260924-205720`).
  const [rackSheet, setRackSheet] = useState<FittingSlotKind | 'drone' | null>(null);
  // The module dialog's variations start folded: a tap on a module is
  // mostly for its state and ammo.
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [mutationOpen, setMutationOpen] = useState(false);
  const [affectedOpen, setAffectedOpen] = useState(false);
  // The filled slot whose module panel is open.
  const [moduleSlot, setModuleSlot] = useState<{ slot: FittingSlotKind; slotIndex: number } | null>(
    null
  );
  // The Fittings menu's dialog, and the Fitting it was opened over: opening
  // any other Fitting from it closes it (adjusted during render, not in an effect).
  const [library, setLibrary] = useState<LibraryAction | null>(null);
  const [libraryOver, setLibraryOver] = useState<Fitting | null>(null);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const characterName = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  )?.name;
  const allCharacters = useCharacters();
  const yourCharacters = useMemo(
    () => allCharacters.map(({ characterId, name }) => ({ characterId, name })),
    [allCharacters]
  );
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);
  const alpha = useFittingAlpha(workspace.fitting);
  const hardpoints = useFittingHardpoints(workspace.fitting);
  const ruleBreaks = useFittingRuleBreaks(
    workspace.fitting,
    workspace.currentStats,
    catalogue,
    hardpoints.kindOf
  );
  const saved = useSavedFittingRecord(workspace.savedId);
  const { savedRecord } = saved;
  useFittingPasteLoad(workspace.loadFromInput);
  const editorShare = useEditorShare(
    activeCharacterId,
    workspace.savedId !== null && savedRecord?.id === workspace.savedId ? savedRecord : null
  );
  // The page's Item Actions — here only Show info (the Fitting editor's menu
  // has no Add to Quickbar or Build Plan): a List name click or a menu's
  // "Show info" opens the page's Item Detail modal.
  const pageItemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  // Bumped on a successful Save to EVE so In-game Fittings remounts and
  // refetches, picking up the fitting that just landed (or the overwrite).
  const [inGameFittingsKey, setInGameFittingsKey] = useState(0);

  const { fitting, stats, edit } = workspace;
  const makeItFit = useMakeItFitDialog({
    workspace,
    fitting,
    catalogue,
    characterId: activeCharacterId,
    isPhone,
    view,
    setView,
    edit,
  });
  // Warm the module browser's hull check in the background once the ship data,
  // pilot and catalogue are in, so opening Add (or changing hull) needn't wait.
  // The panel's own call finds the memoized results.
  useHullFit(context, fitting?.shipTypeId ?? null, true);
  if (library !== null && fitting !== libraryOver) {
    setLibrary(null);
    closeAdd();
  }
  // The Add panel's open state and target belong to one layout tier and one
  // hull: a resize into another tier, or a different hull, starts it closed
  // rather than popping a stale sheet or slide-out aimed at an old slot.
  const hullTypeId = fitting?.shipTypeId ?? null;
  const [addScope, setAddScope] = useState({ mode: addMode, hull: hullTypeId });
  if (addScope.mode !== addMode || addScope.hull !== hullTypeId) {
    setAddScope({ mode: addMode, hull: hullTypeId });
    closeAdd();
  }
  const slotCounts = stats?.slotCounts ?? null;
  const dronesShown = fitting !== null && showsDrones(stats, fitting.drones.length);
  // Removing a droneless hull's last (pasted) drone takes the Drones rack
  // away, so a browser still aimed at it lets go.
  if (target?.kind === 'drone' && !dronesShown) setTarget(null);
  // Module results only line up with the Fitting they were calculated for.
  const moduleResults = workspace.currentStats?.modules ?? null;
  // The catalogue carries no tactical modes (an Affected-by source can be one).
  const typeName = (typeId: number) => {
    const name = catalogue?.types[String(typeId)]?.name;
    if (name !== undefined) return name;
    const mode = tacticalModeKind(typeId);
    return mode !== undefined ? t(`fittings.mode.kind.${mode}`) : `#${typeId}`;
  };

  const charges = useChargeLoading({
    fitting,
    catalogue,
    moduleResults,
    context,
    edit,
  });
  // The cargo item whose quantity dialog is open.
  const [cargoQuantityFor, setCargoQuantityFor] = useState<number | null>(null);
  const selectTarget = useCallback(
    (next: AddTarget | null) => {
      setTarget(next);
      setAddOpen(true);
    },
    [setTarget, setAddOpen]
  );
  const openVariations = useCallback(
    (slot: FittingSlotKind, slotIndex: number) => {
      setRackSheet(null);
      setModuleSlot({ slot, slotIndex });
      setVariationsOpen(true);
      setMutationOpen(false);
    },
    [setRackSheet, setModuleSlot, setVariationsOpen, setMutationOpen]
  );
  const openMutation = useCallback(
    (slot: FittingSlotKind, slotIndex: number) => {
      setRackSheet(null);
      setModuleSlot({ slot, slotIndex });
      setVariationsOpen(false);
      setMutationOpen(true);
    },
    [setRackSheet, setModuleSlot, setVariationsOpen, setMutationOpen]
  );
  const { itemActions, fitAt, droneBay, noteRecent, defaultCharges } = useEditorItemActions({
    fitting,
    stats,
    currentStats: workspace.currentStats,
    edit,
    context,
    catalogue,
    charges,
    target,
    dronesShown,
    dragEnabled: isDesktop,
    selectTarget,
    openCargoQuantity: setCargoQuantityFor,
    openVariations,
    openMutation,
  });

  function openLibrary(action: LibraryAction) {
    setLibraryOver(fitting);
    setLibrary(action);
  }

  /** The Fitting as a click on the module would leave it — same slot choice as `handleAdd` — for the Add panel's hover preview. */
  function previewAdd(f: Fitting, typeId: number, rack: CandidateRack): Fitting | null {
    if (rack === 'drone' || slotCounts === null) return null;
    const slotIndex =
      target?.kind === 'slot' && target.slot === rack
        ? target.slotIndex
        : firstFreeSlotIndex(f, rack, slotCounts[rack]);
    if (slotIndex === null) return null;
    return addModule(f, rack, slotIndex, typeId, () => defaultCharges(f.shipTypeId, rack, typeId));
  }

  function handleAdd(typeId: number, rack: CandidateRack) {
    if (rack === 'drone') {
      edit((f) => addDronesWithinBay(f, typeId, 1, droneBay), `drone-add-${typeId}`);
      setAddedMessage(t('fittings.add.addedDrone', { name: typeName(typeId) }));
      if (addMode === 'sheet') closeAdd();
      return;
    }
    if (slotCounts === null) return;
    const count = slotCounts[rack];
    // The browser stays on the rack's next empty slot, so a row of modules
    // goes in one click each. An item for another rack (fits-this-slot off)
    // goes in that rack's first free slot and leaves the chosen one be.
    const onTarget = target?.kind === 'slot' && target.slot === rack;
    const after: { target: AddTarget | null; slotIndex: number | null } = {
      target,
      slotIndex: null,
    };
    edit((f) => {
      const slotIndex =
        onTarget && target.kind === 'slot' ? target.slotIndex : firstFreeSlotIndex(f, rack, count);
      if (slotIndex === null) return f;
      after.slotIndex = slotIndex;
      const next = addModule(f, rack, slotIndex, typeId, () =>
        defaultCharges(f.shipTypeId, rack, typeId)
      );
      noteRecent(rack, typeId);
      if (onTarget) {
        const free = firstFreeSlotIndex(next, rack, count);
        after.target = free === null ? null : { kind: 'slot', slot: rack, slotIndex: free };
      }
      return next;
    });
    if (after.slotIndex !== null) {
      setAddedMessage(
        t('fittings.add.added', {
          name: typeName(typeId),
          slot: t(`fittings.makeItFit.slot.${rack}`, { index: after.slotIndex + 1 }),
        })
      );
    }
    if (addMode === 'sheet') closeAdd();
    else setTarget(after.target);
  }

  function selectSlot(slot: FittingSlotKind, slotIndex: number) {
    const filled = fitting?.modules.some((m) => m.slot === slot && m.slotIndex === slotIndex);
    if (filled) openModuleDialog(slot, slotIndex, false);
    else selectTarget({ kind: 'slot', slot, slotIndex });
  }

  /**
   * Opens a fitted module's dialog. A slot tap leads with its state and ammo,
   * variations folded; the menu's Variations entry opens them unfolded.
   */
  function openModuleDialog(slot: FittingSlotKind, slotIndex: number, withVariations: boolean) {
    setModuleSlot({ slot, slotIndex });
    setVariationsOpen(withVariations);
    setMutationOpen(false);
  }

  /** From a phone sheet (a rack's or the drones'): one sheet at a time, so the Add sheet takes over. */
  function selectTargetFromSheet(next: AddTarget) {
    setRackSheet(null);
    selectTarget(next);
  }

  function closeAdd() {
    setAddOpen(false);
    setTarget(null);
  }

  const addTitle =
    target === null
      ? t('fittings.add.title')
      : t('fittings.add.titleFor', { rack: t(`fittings.add.rack.${targetRack(target)}`) });

  const addPanel = fitting && (
    <FittingAddPanel
      fitting={fitting}
      catalogue={catalogue}
      target={target}
      context={context}
      onAdd={handleAdd}
      onClearTarget={() => setTarget(null)}
      moduleResults={moduleResults}
      onLoadCharge={(chargeTypeId) => charges.load(chargeTypeId)}
      onAddCargo={(typeId, quantity) => edit((f) => addCargo(f, typeId, quantity))}
      dragToRing={isDesktop && !coarsePointer}
      preview={
        coarsePointer || slotCounts === null
          ? undefined
          : { variants: workspace.variants, build: previewAdd }
      }
      showDrones={dronesShown}
      droneRoomFor={(typeId) => droneRoom(fitting, typeId, droneBay)}
      slotFreeFor={
        slotCounts === null
          ? undefined
          : (rack) =>
              (target?.kind === 'slot' && target.slot === rack) ||
              firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null
      }
    />
  );

  const openModuleIndex = moduleSlot
    ? (fitting?.modules.findIndex(
        (m) => m.slot === moduleSlot.slot && m.slotIndex === moduleSlot.slotIndex
      ) ?? -1)
    : -1;
  const openModule = fitting && openModuleIndex >= 0 ? fitting.modules[openModuleIndex] : null;
  const { rows: variationRows } = useModuleVariations({
    variants: workspace.variants,
    slot: moduleSlot?.slot ?? 'high',
    slotIndex: moduleSlot?.slotIndex ?? 0,
    typeId: openModule?.typeId ?? 0,
    catalogue,
  });
  function swapVariation(typeId: number) {
    if (!moduleSlot) return;
    edit((f) => swapModuleType(f, moduleSlot.slot, moduleSlot.slotIndex, typeId));
  }
  const targetProfiles = useTargetProfiles();
  const improve = useImproveDrawer({
    workspace,
    fitting,
    catalogue,
    targetProfiles,
    edit,
    characterId: activeCharacterId,
    charges,
    context,
    moduleResults,
    openMakeItFit: makeItFit.open,
  });
  // Improve and the Add browser share the left of the page: the last one opened wins.
  const { docked: improveDocked, close: closeImprove } = improve;
  const opened = useRef({ add: addOpen, improve: improveDocked });
  useEffect(() => {
    const was = opened.current;
    opened.current = { add: addOpen, improve: improveDocked };
    if (addOpen && improveDocked) {
      if (!was.add) closeImprove();
      else if (!was.improve) setAddOpen(false);
    }
  }, [addOpen, improveDocked, closeImprove]);
  const overlay = useOverlayFitting({
    characterId: activeCharacterId,
    profile: workspace.profile,
    damageProfile: workspace.damageProfiles.selected,
  });

  const startHull = (hull: HullEntry) =>
    void workspace.openFitting(newFitting(hull.typeId, hull.name));
  // Reopening the Fitting already open changes nothing to close on, so an
  // explicit open closes the Fittings menu's dialog itself.
  const closeLibrary = () => setLibrary(null);

  if (fitting === null) {
    // The Start screen renders the header and the Ships tabs itself: it owns
    // the In-game data age and refresh. A broken Fitting Share Code opens its Import.
    return (
      <FittingStartScreen
        workspace={workspace}
        catalogue={catalogue}
        characterId={activeCharacterId}
        inGameKey={inGameFittingsKey}
        onStartHull={startHull}
        pageTitle={t('nav.ships')}
        pageTabs={<ShipsTabBar />}
        pageTabsPanel={{ tabsId: SHIPS_TABS_ID, tabId: 'fittings' }}
      />
    );
  }

  // The docked browser is always there; the others open on demand.
  const addButton =
    addMode === 'docked' ? undefined : (
      <Button size="sm" className={tappableRowClassName} onClick={() => selectTarget(null)}>
        <AddRow aria-hidden />
        {t('fittings.add.openButton')}
      </Button>
    );

  const fightersShown =
    fitting !== null &&
    ((fitting.fighters?.length ?? 0) > 0 || (stats?.fighters.tubes?.total ?? 0) > 0);

  const editor = (
    <FittingEditorPanes
      view={view}
      onViewChange={addMode === 'sheet' ? undefined : (next) => void setView(next)}
      fitting={fitting}
      stats={stats}
      moduleResults={moduleResults}
      catalogue={catalogue}
      context={context}
      edit={edit}
      target={target}
      onSelectTarget={selectTarget}
      unusableModuleKeys={gaps?.unusableModuleKeys}
      typeName={typeName}
      onSlotSelect={selectSlot}
      dragEnabled={isDesktop}
      onDropType={fitAt}
      isPhone={isPhone}
      onRackOpen={setRackSheet}
      hardpoints={hardpoints}
      addButton={addButton}
      dronesShown={dronesShown}
      fightersShown={fightersShown}
      onOpenMakeItFit={makeItFit.open}
    />
  );

  const statsSections = (
    <FittingStatsColumn
      workspace={workspace}
      catalogue={catalogue}
      fitting={fitting}
      moduleResults={moduleResults}
      dronesShown={dronesShown}
      gaps={gaps}
      characterId={activeCharacterId}
      characterName={characterName}
      yourCharacters={yourCharacters}
      targetProfiles={targetProfiles}
      overlay={overlay}
      onOpenMakeItFit={makeItFit.open}
      preview={improve.preview}
      previewIsk={improve.previewIsk}
      ruleBreaks={ruleBreaks.lines}
    />
  );

  // Under the name: the hull, unless the Fitting is simply named after it,
  // and whether this is a saved Fitting.
  const hullName = typeName(fitting.shipTypeId);
  // The open slide-out takes 26rem off the page, too little for the one-row header.
  const {
    addMode: layoutAddMode,
    addOpen: layoutAddOpen,
    pushed,
    statsFirst,
  } = leftColumn(addMode, addOpen, improve.docked);
  const headerCompact = addMode === 'sheet' || pushed;
  const subtitle = [
    hullName !== fitting.name ? hullName : null,
    workspace.savedId !== null ? t('fittings.header.savedInMyFittings') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    // The open slide-out pushes the page aside rather than covering it, so
    // every Ring slot stays a drop target. (It can't get out of the way
    // mid-drag instead: moving or hiding a drag's source element cancels it.)
    <ItemActionsProvider page={pageItemActions}>
      <FittingItemActionsProvider value={itemActions}>
        <RuleBreakFlags.Provider value={ruleBreaks.flagged}>
          {/* Capped and centred, so a wide screen gets even gutters rather than an empty Ring
        panel (scope decision `20261016-171349`). */}
          {/* Pushed (the Add slide-out): from the panel's edge, not centred, so a wide screen leaves no gap beside it. */}
          <div className={`max-w-[120rem] space-y-3 ${pushed ? 'pl-[26rem]' : 'mx-auto'}`}>
            <FittingEditorHeader
              workspace={workspace}
              fitting={fitting}
              stats={stats}
              characterId={activeCharacterId}
              subtitle={subtitle}
              hullName={hullName}
              compact={headerCompact}
              alpha={alpha}
              share={editorShare}
              saved={saved}
              onLibrary={openLibrary}
              onSavedToEve={() => setInGameFittingsKey((key) => key + 1)}
              onImprove={improve.open}
            />
            {workspace.tooLargeToShare && (
              <p role="alert" className="text-xs text-warning">
                {t('fittings.load.tooLargeToShare')} {t('fittings.load.tooLargeToShareDraft')}
              </p>
            )}
            {/* Only a Load that opened a Fitting describes this one; a failed Load's
          warnings stay with the Load card that reported them. */}
            {workspace.lastLoad?.kind === 'fitting' && <LoadWarnings load={workspace.lastLoad} />}
            <LiveStatus data-testid="fitting-added-status" announceKey={added.n}>
              {added.message}
            </LiveStatus>
            {/* What the last charge load did: "loaded 3 of 4, cargo ran out". */}
            <p role="status" className="text-xs text-text-dim empty:hidden">
              {charges.message}
            </p>

            <FittingEditorLayout
              addMode={layoutAddMode}
              addOpen={layoutAddOpen}
              addTitle={addTitle}
              addPanel={addPanel}
              onCloseAdd={closeAdd}
              viewHydrated={viewHydrated}
              view={view}
              onViewChange={(next) => void setView(next)}
              editor={editor}
              statsSections={statsSections}
              statsFirst={statsFirst}
              improveColumn={improve.column}
            />
            {makeItFit.dialog}
            {improve.drawer}
            <FittingLibraryDialogs
              library={library}
              onClose={closeLibrary}
              workspace={workspace}
              catalogue={catalogue}
              characterId={activeCharacterId}
              inGameKey={inGameFittingsKey}
              isPhone={isPhone}
              onStartHull={startHull}
            />
            <FittingModuleDialog
              module={openModule}
              moduleIndex={openModuleIndex}
              fallbackSlot={moduleSlot?.slot ?? 'high'}
              onClose={() => setModuleSlot(null)}
              placement={isPhone ? 'sheet' : 'wide'}
              result={moduleResults?.[openModuleIndex] ?? null}
              cantUse={
                openModule ? (gaps?.unusableModuleKeys.has(moduleKey(openModule)) ?? false) : false
              }
              fitting={fitting}
              catalogue={catalogue}
              context={context}
              edit={edit}
              variationRows={variationRows}
              onSwapVariation={swapVariation}
              variationsOpen={variationsOpen}
              onToggleVariations={() => setVariationsOpen((open) => !open)}
              mutationOpen={mutationOpen}
              onToggleMutation={() => setMutationOpen((open) => !open)}
              canMutate={openModule ? (itemActions?.canMutate(openModule.typeId) ?? false) : false}
              affectedOpen={affectedOpen}
              onToggleAffected={() => setAffectedOpen((open) => !open)}
              explainModule={workspace.explainModule}
              typeName={typeName}
              characterId={activeCharacterId}
            />
            {isPhone && (
              <FittingRackSheet
                rack={rackSheet}
                onClose={() => setRackSheet(null)}
                fitting={fitting}
                catalogue={catalogue}
                context={context}
                edit={edit}
                stats={stats}
                moduleResults={moduleResults}
                target={target}
                onSelectTarget={selectTargetFromSheet}
                unusableModuleKeys={gaps?.unusableModuleKeys}
              />
            )}
            {cargoQuantityFor !== null && (
              <CargoQuantityDialog
                name={catalogueTypeName(catalogue, cargoQuantityFor)}
                quantity={
                  cargoGroups(fitting).find((item) => item.typeId === cargoQuantityFor)?.quantity ??
                  1
                }
                onClose={() => setCargoQuantityFor(null)}
                onConfirm={(quantity) => {
                  const typeId = cargoQuantityFor;
                  edit((f) => setCargoQuantity(f, typeId, quantity));
                  setCargoQuantityFor(null);
                }}
              />
            )}
          </div>
        </RuleBreakFlags.Provider>
      </FittingItemActionsProvider>
    </ItemActionsProvider>
  );
}
