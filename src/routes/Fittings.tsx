import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { fittingCompareHref, fittingsRedirect } from '@/features/fittings/fittingRoutes';
import { ShipsTabBar } from '@/features/fittings/ShipsTabBar';
import { SHIPS_TABS_ID } from '@/features/fittings/shipsTabs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  LiveStatus,
  Modal,
  Panel,
  SlideOver,
  Tabs,
  TabPanel,
  useTabsId,
  Toast,
  useTimedToast,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { AddRow } from '@/components/ui/icons';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
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
import { type FitResource } from '@/features/fittings/makeItFitContext';
import { MakeItFitDialog } from '@/features/fittings/MakeItFitDialog';
import { CargoQuantityDialog } from '@/features/fittings/CargoQuantityDialog';
import { FittingItemActionsProvider } from '@/features/fittings/fittingItemActions';
import { useChargeLoading } from '@/features/fittings/useChargeLoading';
import { useEditorItemActions } from '@/features/fittings/useEditorItemActions';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { writeCompareCodes } from '@/features/fittings/compareUrl';
import { useEditorShare } from '@/features/fittings/useEditorShare';
import { FittingHeader, type LibraryAction } from '@/features/fittings/FittingHeader';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { FittingSaveButton } from '@/features/fittings/FittingSaveButton';
import { LoadWarnings } from '@/features/fittings/FittingLoadCard';
import { FittingStartScreen } from '@/features/fittings/FittingStartScreen';
import { FittingLibraryDialogs } from '@/features/fittings/FittingLibraryDialogs';
import { FittingEditorPanes } from '@/features/fittings/FittingEditorPanes';
import { FittingRackSheet } from '@/features/fittings/FittingRackSheet';
import { LazySaveToEveDialog } from '@/features/fittings/LazySaveToEveDialog';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { FittingModuleDialog } from '@/features/fittings/FittingModuleDialog';
import { SaveAsNewDialog } from '@/features/fittings/SaveAsNewDialog';
import { RING_ROOM_ATTR } from '@/features/fittings/ring/useRingChrome';
import { FittingStatsColumn } from '@/features/fittings/FittingStatsColumn';
import {
  THREE_COLUMN_QUERY,
  addModeFor,
  editorColumnClass,
  editorGridClass,
} from '@/features/fittings/fittingLayout';
import { useFittingPasteLoad } from '@/features/fittings/useFittingPasteLoad';
import { useSavedFittingRecord } from '@/features/fittings/useSavedFittingRecord';
import { tacticalModeKind } from '@/engine/fittings/tacticalModes';
import {
  resolveFittingView,
  useFittingViewPreference,
  type FittingView,
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
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const context = useFittingContext(workspace.profile, catalogue);
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
  // Which budget's "Fix" link opened Make it fit; null while it is closed.
  const [makeItFitFor, setMakeItFitFor] = useState<FitResource | null>(null);
  // What the last applied Make it fit option changed, for its confirmation toast.
  const [fitApplied, setFitApplied] = useState<string | null>(null);
  useTimedToast(fitApplied, () => setFitApplied(null));
  const openMakeItFit = useCallback(
    (resource: FitResource) => setMakeItFitFor(resource),
    [setMakeItFitFor]
  );
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useHydratedStore(useFittingViewPreference);
  const setView = useFittingViewPreference((state) => state.setValue);
  const view = resolveFittingView(storedView, isPhone);
  // Below desktop the Ring, the List and the stats are one set of tabs.
  const [phoneTab, setPhoneTab] = useState<'editor' | 'stats'>('editor');
  // One tab bar renders at a time (phone sheet or docked/wide), so one id base serves both.
  const viewTabsId = useTabsId();
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
  const [saveToEveOpen, setSaveToEveOpen] = useState(false);
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false);
  const [saveAsNewName, setSaveAsNewName] = useState('');
  const { savedRecord, currentShareCode, hasUnsavedEdits } = useSavedFittingRecord(
    workspace.savedId
  );
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
  const canSaveToEve = useEndpointsGranted(['postCharacterFitting']);
  const online = useOnline();

  const { fitting, stats, edit } = workspace;
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
      onOpenMakeItFit={openMakeItFit}
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
      onOpenMakeItFit={openMakeItFit}
    />
  );

  // Under the name: the hull, unless the Fitting is simply named after it,
  // and whether this is a saved Fitting.
  const hullName = typeName(fitting.shipTypeId);
  // The open slide-out takes 26rem off the page, too little for the one-row header.
  const headerCompact = addMode === 'sheet' || (addMode === 'slideOut' && addOpen);
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
        {/* Capped and centred, so a wide screen gets even gutters rather than an empty Ring
        panel (scope decision `20261016-171349`). */}
        <div
          className={`mx-auto max-w-[120rem] space-y-3 ${addOpen && addMode === 'slideOut' ? 'pl-[26rem]' : ''}`}
        >
          <FittingHeader
            fitting={fitting}
            subtitle={subtitle}
            onRename={workspace.rename}
            onLibrary={openLibrary}
            onCompare={() => {
              // Unsaved edits against a saved Fitting: Compare opens saved vs.
              // current rather than just the one code already in the URL.
              if (hasUnsavedEdits && savedRecord && currentShareCode) {
                const params = writeCompareCodes(new URLSearchParams(), [
                  savedRecord.code,
                  currentShareCode,
                ]);
                navigate(fittingCompareHref(params.toString()));
                return;
              }
              navigate(fittingCompareHref(location.search));
            }}
            price={workspace.price}
            cloneImplants={workspace.profile?.implantTypeIds}
            compact={headerCompact}
            stats={stats}
            share={editorShare}
            badges={{
              alpha: { blockers: alpha.blockers, skillName: alpha.skillName },
              mastery:
                activeCharacterId !== null
                  ? {
                      hullTypeId: fitting.shipTypeId,
                      hullName,
                      characterId: activeCharacterId,
                    }
                  : null,
            }}
            save={
              <FittingSaveButton
                compact={headerCompact}
                onSave={() => void workspace.save()}
                canSave={workspace.canSave}
                saveBlockedReason={
                  activeCharacterId === null
                    ? t('fittings.myFittings.needCharacter')
                    : workspace.tooLargeToShare
                      ? t('fittings.myFittings.tooLarge')
                      : undefined
                }
                updating={workspace.savedId !== null}
                onSaveAsNew={() => {
                  setSaveAsNewName(
                    t('fittings.myFittings.saveAsNewDefaultName', {
                      name: savedRecord?.name ?? fitting.name,
                    })
                  );
                  setSaveAsNewOpen(true);
                }}
                onSaveToEve={() => setSaveToEveOpen(true)}
                canSaveToEve={activeCharacterId !== null && canSaveToEve === true && online}
                saveToEveBlockedReason={
                  activeCharacterId === null
                    ? t('fittings.saveToEve.needCharacter')
                    : !online
                      ? t('fittings.saveToEve.needsConnection')
                      : undefined
                }
                saveToEveMissingGroups={
                  activeCharacterId !== null && canSaveToEve === false ? ['fittings'] : undefined
                }
              />
            }
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

          {viewHydrated &&
            (addMode === 'sheet' ? (
              <div className="space-y-3">
                <Tabs
                  tabsId={viewTabsId}
                  tabs={[
                    { id: 'ring', label: t('fittings.view.ring') },
                    { id: 'list', label: t('fittings.view.list') },
                    { id: 'stats', label: t('fittings.phoneTabs.stats') },
                  ]}
                  value={phoneTab === 'stats' ? 'stats' : view}
                  onChange={(id) => {
                    if (id === 'stats') {
                      setPhoneTab('stats');
                      return;
                    }
                    setPhoneTab('editor');
                    void setView(id as FittingView);
                  }}
                  label={t('fittings.phoneTabs.label')}
                />
                <TabPanel
                  tabsId={viewTabsId}
                  tabId={phoneTab === 'stats' ? 'stats' : view}
                  className="space-y-3"
                >
                  {phoneTab === 'stats' ? statsSections : editor}
                </TabPanel>
              </div>
            ) : (
              <div className={editorGridClass(addMode, view, addOpen)}>
                {addMode === 'docked' && (
                  <Panel
                    title={addTitle}
                    className="sticky top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto"
                  >
                    {addPanel}
                  </Panel>
                )}
                {/* Ring | List as the app's own tabs over the column they switch. */}
                <div
                  data-testid="fitting-editor-column"
                  {...{ [RING_ROOM_ATTR]: '' }}
                  className={editorColumnClass(view, addMode, addOpen)}
                >
                  <Tabs
                    tabsId={viewTabsId}
                    tabs={[
                      { id: 'ring', label: t('fittings.view.ring') },
                      { id: 'list', label: t('fittings.view.list') },
                    ]}
                    value={view}
                    onChange={(id) => void setView(id as FittingView)}
                    label={t('fittings.view.label')}
                  />
                  <TabPanel tabsId={viewTabsId} tabId={view} className="space-y-3">
                    {editor}
                  </TabPanel>
                </div>
                {statsSections}
              </div>
            ))}

          <MakeItFitDialog
            open={makeItFitFor !== null}
            resource={makeItFitFor}
            onClose={() => setMakeItFitFor(null)}
            variants={workspace.variants}
            skillGains={workspace.skillGains}
            characterId={activeCharacterId}
            fittingName={fitting.name}
            implants={
              workspace.profile
                ? {
                    fitting,
                    profile: workspace.profile,
                    basis: workspace.implantBasis,
                    onChange: workspace.setImplantSet,
                  }
                : null
            }
            onImplantsApplied={(names) => {
              setMakeItFitFor(null);
              setFitApplied(t('fittings.makeItFit.implantsApplied', { names }));
            }}
            catalogue={catalogue}
            placement={isPhone ? 'sheet' : 'center'}
            onOpenList={
              view === 'list'
                ? undefined
                : () => {
                    void setView('list');
                    setMakeItFitFor(null);
                  }
            }
            onApply={(option) => {
              edit((f) =>
                option.swaps.reduce(
                  (acc, swap) => swapModuleType(acc, swap.slot, swap.slotIndex, swap.toTypeId),
                  f
                )
              );
              setMakeItFitFor(null);
              setFitApplied(
                t('fittings.makeItFit.applied', {
                  swap: option.swaps
                    .map((swap) =>
                      t('fittings.makeItFit.swap', {
                        from: catalogueTypeName(catalogue, swap.fromTypeId),
                        to: catalogueTypeName(catalogue, swap.toTypeId),
                      })
                    )
                    .join('; '),
                })
              );
            }}
          />
          {/* No Undo here: the editor has no in-app undo, only the browser's Back (one swap is one history entry). */}
          {fitApplied !== null && <Toast message={fitApplied} />}
          <SaveAsNewDialog
            open={saveAsNewOpen}
            onClose={() => setSaveAsNewOpen(false)}
            name={saveAsNewName}
            onNameChange={setSaveAsNewName}
            onConfirm={(name) => void workspace.saveAsNew(name)}
          />
          {activeCharacterId !== null && saveToEveOpen && (
            <LazySaveToEveDialog
              open
              onClose={() => setSaveToEveOpen(false)}
              characterId={activeCharacterId}
              fitting={fitting}
              description={savedRecord?.notes ?? ''}
              onSaved={() => setInGameFittingsKey((key) => key + 1)}
              onSaveToMyFittings={workspace.savedId === null ? workspace.save : undefined}
            />
          )}
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
          {addMode === 'sheet' && (
            <Modal open={addOpen} onClose={closeAdd} placement="sheet" title={addTitle}>
              {addPanel}
            </Modal>
          )}
          {addMode === 'slideOut' && (
            <SlideOver
              side="left"
              // Clears the app's 12rem nav, so it slides out where the docked column sits.
              className="md:left-48"
              open={addOpen}
              onClose={closeAdd}
              title={addTitle}
            >
              {addPanel}
            </SlideOver>
          )}
          {cargoQuantityFor !== null && (
            <CargoQuantityDialog
              name={catalogueTypeName(catalogue, cargoQuantityFor)}
              quantity={
                cargoGroups(fitting).find((item) => item.typeId === cargoQuantityFor)?.quantity ?? 1
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
      </FittingItemActionsProvider>
    </ItemActionsProvider>
  );
}
