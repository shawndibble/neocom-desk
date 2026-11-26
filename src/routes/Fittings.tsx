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
import { LoadWarnings } from '@/features/fittings/FittingLoadCard';
import { FittingEditorHeader } from '@/features/fittings/FittingEditorHeader';
import { FittingEditorLayout } from '@/features/fittings/FittingEditorLayout';
import { useMakeItFitDialog } from '@/features/fittings/useMakeItFitDialog';
import { useImproveDrawer } from '@/features/fittings/useImproveDrawer';
import type { LibraryAction } from '@/features/fittings/FittingHeader';
import { FittingStartScreen } from '@/features/fittings/FittingStartScreen';
import type { StartHull } from '@/engine/fittings/hullCatalogue';
import { FittingLibraryDialogs } from '@/features/fittings/FittingLibraryDialogs';
import { FittingEditorPanes } from '@/features/fittings/FittingEditorPanes';
import { FittingRackSheet } from '@/features/fittings/FittingRackSheet';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { FittingModuleDialog } from '@/features/fittings/FittingModuleDialog';
import { FittingStatsColumn } from '@/features/fittings/FittingStatsColumn';
import { ImplantsEditorHost } from '@/features/fittings/ImplantsEditorHost';
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

export function Fittings() {
  const { pathname, search } = useLocation();
  const redirectTo = fittingsRedirect(pathname, search);
  return redirectTo === null ? <FittingsPage /> : <Navigate to={redirectTo} replace />;
}

const RIGHT_PANEL_ROOM = 'min-[115rem]:[body:has([data-slide-over=right])_&]:pr-[26rem]';

function FittingsPage() {
  const { t } = useTranslation();
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
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const addMode = addModeFor(threeColumns, isDesktop);
  const [target, setTarget] = useState<AddTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [added, setAdded] = useState({ message: '', n: 0 });
  const setAddedMessage = (message: string) => setAdded((a) => ({ message, n: a.n + 1 }));
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useHydratedStore(useFittingViewPreference);
  const setView = useFittingViewPreference((state) => state.setValue);
  const view = resolveFittingView(storedView, isPhone);
  const [rackSheet, setRackSheet] = useState<FittingSlotKind | 'drone' | null>(null);
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [mutationOpen, setMutationOpen] = useState(false);
  const [affectedOpen, setAffectedOpen] = useState(false);
  const [moduleSlot, setModuleSlot] = useState<{ slot: FittingSlotKind; slotIndex: number } | null>(
    null
  );
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
  const pageItemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
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
  useHullFit(context, fitting?.shipTypeId ?? null, true);
  if (library !== null && fitting !== libraryOver) {
    setLibrary(null);
    closeAdd();
  }
  const hullTypeId = fitting?.shipTypeId ?? null;
  const [addScope, setAddScope] = useState({ mode: addMode, hull: hullTypeId });
  if (addScope.mode !== addMode || addScope.hull !== hullTypeId) {
    setAddScope({ mode: addMode, hull: hullTypeId });
    closeAdd();
  }
  const slotCounts = stats?.slotCounts ?? null;
  const dronesShown = fitting !== null && showsDrones(stats, fitting.drones.length);
  if (target?.kind === 'drone' && !dronesShown) setTarget(null);
  const moduleResults = workspace.currentStats?.modules ?? null;
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

  function openModuleDialog(slot: FittingSlotKind, slotIndex: number, withVariations: boolean) {
    setModuleSlot({ slot, slotIndex });
    setVariationsOpen(withVariations);
    setMutationOpen(false);
  }

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
  const [whatToTrainRequested, setWhatToTrainRequested] = useState(false);
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
    showWhatToTrain: () => setWhatToTrainRequested(true),
  });
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

  const startHull = (hull: StartHull) =>
    void workspace.openFitting(newFitting(hull.typeId, hull.name));
  const closeLibrary = () => setLibrary(null);

  if (fitting === null) {
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
      whatToTrainRequested={whatToTrainRequested}
      onWhatToTrainShown={() => setWhatToTrainRequested(false)}
    />
  );

  const hullName = typeName(fitting.shipTypeId);
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
    <ItemActionsProvider page={pageItemActions}>
      <FittingItemActionsProvider value={itemActions}>
        <RuleBreakFlags.Provider value={ruleBreaks.flagged}>
          <div
            className={`max-w-[120rem] space-y-3 ${pushed ? 'pl-[26rem]' : 'mx-auto'} ${RIGHT_PANEL_ROOM}`}
          >
            <FittingEditorHeader
              workspace={workspace}
              fitting={fitting}
              stats={stats}
              characterId={activeCharacterId}
              subtitle={subtitle}
              hullName={hullName}
              compact={headerCompact}
              alpha={alpha}
              alphaInTabs={layoutAddMode === 'sheet'}
              share={editorShare}
              saved={saved}
              onLibrary={openLibrary}
              onSavedToEve={() => setInGameFittingsKey((key) => key + 1)}
              onImprove={improve.open}
              unflyable={(gaps?.unusableModuleKeys.size ?? 0) > 0}
            />
            {workspace.tooLargeToShare && (
              <p role="alert" className="text-xs text-warning">
                {t('fittings.load.tooLargeToShare')} {t('fittings.load.tooLargeToShareDraft')}
              </p>
            )}
            {workspace.lastLoad?.kind === 'fitting' && <LoadWarnings load={workspace.lastLoad} />}
            <LiveStatus data-testid="fitting-added-status" announceKey={added.n}>
              {added.message}
            </LiveStatus>
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
              statsRequested={whatToTrainRequested}
              statsFirst={statsFirst}
              alpha={{ blockers: alpha.blockers, skillName: alpha.skillName }}
              improveColumn={improve.column}
            />
            {makeItFit.dialog}
            {improve.drawer}
            <ImplantsEditorHost
              basis={workspace.implantBasis}
              canUseCloneBasis={workspace.canUseCloneBasis}
              implantSet={fitting.implantSet}
              onImplantSetChange={workspace.setImplantSet}
              fitting={fitting}
              profile={workspace.profile}
            />
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
              variants={workspace.variants}
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
