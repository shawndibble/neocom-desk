import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatIskCompact } from '@/lib/isk';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Disclosure, Modal, PageHeader, Panel, SlideOver, Tabs } from '@/components/ui';
import { AddRow } from '@/components/ui/icons';
import { AbyssalWeatherPicker } from '@/features/fittings/AbyssalWeatherPicker';
import { usePickedWeatherName } from '@/features/fittings/abyssalWeatherSelection';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import type { Fitting, FittingSlotKind } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addDronesWithinBay,
  addModule,
  droneRoom,
  droneTotals,
  firstFreeSlotIndex,
  loadChargeIntoAll,
  moveModule,
  newFitting,
  removeModule,
  setModuleCharge,
  setModuleState,
  swapModuleType,
  type DroneBay,
} from '@/engine/fittings/fittingEdit';
import { FittingAddPanel } from '@/features/fittings/FittingAddPanel';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { FittingHeader } from '@/features/fittings/FittingHeader';
import { FittingSaveButton } from '@/features/fittings/FittingSaveButton';
import { LoadWarnings } from '@/features/fittings/FittingLoadCard';
import { FittingLibrary, type LibraryTab } from '@/features/fittings/FittingLibrary';
import { SaveToEveDialog } from '@/features/fittings/SaveToEveDialog';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import {
  DroneSection,
  FittingRackList,
  ModuleRow,
  RackSlots,
} from '@/features/fittings/FittingRackList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { FittingVariationsPanel } from '@/features/fittings/FittingVariationsPanel';
import { ImplantBasisControl } from '@/features/fittings/ImplantBasisControl';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import {
  resolveFittingView,
  useFittingViewPreference,
  type FittingView,
} from '@/features/fittings/fittingViewPreference';
import { AlphaCloneChip } from '@/features/fittings/AlphaCloneChip';
import { MissingSkillsChip } from '@/features/fittings/MissingSkillsChip';
import { useFittingAlpha } from '@/features/fittings/useFittingAlpha';
import { useFittingHardpoints } from '@/features/fittings/useFittingHardpoints';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import {
  catalogueTypeName,
  catalogueVolume,
  useFittingCatalogue,
} from '@/features/fittings/useFittingCatalogue';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';
import { useModuleVariations } from '@/features/fittings/useModuleVariations';
import { useOverlayFitting } from '@/features/fittings/useOverlayFitting';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { useMediaQuery } from '@/lib/useMediaQuery';

/**
 * Wide enough for browser | Ring | stats side by side: the 12rem nav, a 20rem
 * browser, a Ring column that shows the ring at (or near) its 36rem cap, and
 * 22-26rem of stats, with gaps and page padding.
 */
const THREE_COLUMN_QUERY = '(min-width: 100rem)';

/** A mouse or trackpad: where a Ring tile's right-click menu doesn't fight the tooltip's touch-and-hold. */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const threeColumns = useMediaQuery(THREE_COLUMN_QUERY);
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const addMode: 'docked' | 'slideOut' | 'sheet' = threeColumns
    ? 'docked'
    : isDesktop
      ? 'slideOut'
      : 'sheet';
  const [target, setTarget] = useState<AddTarget | null>(null);
  // The slide-out or sheet Add panel is open (the docked one always is).
  // Opened by an empty slot, or by "+ Add module" — which works before the
  // ship data (and so the empty slots) exists.
  const [addOpen, setAddOpen] = useState(false);
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useFittingViewPreference((state) => state.hydrated);
  const hydrateView = useFittingViewPreference((state) => state.hydrate);
  const setView = useFittingViewPreference((state) => state.setValue);
  useEffect(() => {
    void hydrateView();
  }, [hydrateView]);
  const view = resolveFittingView(storedView, isPhone);
  // Below desktop the Ring, the List and the stats are one set of tabs.
  const [phoneTab, setPhoneTab] = useState<'editor' | 'stats'>('editor');
  // Phone Ring: the rack whose slots sheet is open (scope decision `20260924-205720`).
  const [rackSheet, setRackSheet] = useState<FittingSlotKind | 'drone' | null>(null);
  // The module dialog's variations start folded: a tap on a module is
  // mostly for its state and ammo.
  const [variationsOpen, setVariationsOpen] = useState(false);
  // The filled slot whose module panel is open.
  const [moduleSlot, setModuleSlot] = useState<{ slot: FittingSlotKind; slotIndex: number } | null>(
    null
  );
  // The Fittings menu's dialog, and the Fitting it was opened over: opening
  // any other Fitting from it closes it (adjusted during render, not in an effect).
  const [library, setLibrary] = useState<LibraryTab | null>(null);
  const [libraryOver, setLibraryOver] = useState<Fitting | null>(null);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const characterName = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  )?.name;
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);
  const alpha = useFittingAlpha(workspace.fitting);
  const hardpointsUsed = useFittingHardpoints(workspace.fitting);
  const weatherName = usePickedWeatherName();
  const [saveToEveOpen, setSaveToEveOpen] = useState(false);
  // The item whose info (the Market's item detail) is open — a List name click.
  const [infoItem, setInfoItem] = useState<{ typeId: number; name: string } | null>(null);
  const showInfo = (typeId: number, name: string) => setInfoItem({ typeId, name });
  // Bumped on a successful Save to EVE so In-game Fittings remounts and
  // refetches, picking up the fitting that just landed (or the overwrite).
  const [inGameFittingsKey, setInGameFittingsKey] = useState(0);
  const canSaveToEve = useEndpointsGranted(['postCharacterFitting']);

  const { fitting, stats, edit } = workspace;
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
  const moduleResults = stats !== null && workspace.statsFitting === fitting ? stats.modules : null;
  const typeName = (typeId: number) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;

  function openLibrary(tab: LibraryTab) {
    setLibraryOver(fitting);
    setLibrary(tab);
  }

  // Before the ship data the bay's size is unknown (null), so nothing is capped yet.
  const droneBay: DroneBay | null =
    stats === null
      ? null
      : { capacity: stats.droneCapacity, volumeOf: (typeId) => catalogueVolume(catalogue, typeId) };

  function canPlace(rack: CandidateRack, typeId: number): boolean {
    if (rack === 'drone') {
      // Room for one more of this drone beside what the bay already holds.
      return dronesShown && fitting !== null && droneRoom(fitting, typeId, droneBay) >= 1;
    }
    if (fitting === null || slotCounts === null) return false;
    if (target?.kind === 'slot' && target.slot === rack) return true;
    return firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null;
  }

  function handleAdd(typeId: number, rack: CandidateRack) {
    if (rack === 'drone') {
      edit((f) => addDronesWithinBay(f, typeId, 1, droneBay), `drone-add-${typeId}`);
      if (addMode === 'sheet') closeAdd();
      return;
    }
    if (slotCounts === null) return;
    const count = slotCounts[rack];
    // The browser stays on the rack's next empty slot, so a row of modules
    // goes in one click each. An item for another rack (fits-this-slot off)
    // goes in that rack's first free slot and leaves the chosen one be.
    const onTarget = target?.kind === 'slot' && target.slot === rack;
    const after: { target: AddTarget | null } = { target };
    edit((f) => {
      const slotIndex =
        onTarget && target.kind === 'slot' ? target.slotIndex : firstFreeSlotIndex(f, rack, count);
      if (slotIndex === null) return f;
      const next = addModule(f, rack, slotIndex, typeId);
      if (onTarget) {
        const free = firstFreeSlotIndex(next, rack, count);
        after.target = free === null ? null : { kind: 'slot', slot: rack, slotIndex: free };
      }
      return next;
    });
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
   * variations folded; the List's Variations button opens them unfolded.
   */
  function openModuleDialog(slot: FittingSlotKind, slotIndex: number, withVariations: boolean) {
    setModuleSlot({ slot, slotIndex });
    setVariationsOpen(withVariations);
  }

  /** From a phone sheet (a rack's or the drones'): one sheet at a time, so the Add sheet takes over. */
  function selectTargetFromSheet(next: AddTarget) {
    setRackSheet(null);
    selectTarget(next);
  }

  function selectTarget(next: AddTarget | null) {
    setTarget(next);
    setAddOpen(true);
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
      engineReady={workspace.engineReady}
      profile={workspace.profile}
      canPlace={canPlace}
      onAdd={handleAdd}
      onClearTarget={() => setTarget(null)}
      moduleResults={moduleResults}
      onLoadCharge={(moduleTypeId, chargeTypeId) =>
        edit((f) => loadChargeIntoAll(f, moduleTypeId, chargeTypeId))
      }
      dragToRing={isDesktop && view === 'ring'}
      showDrones={dronesShown}
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

  const renderLibrary = (layout: 'page' | 'tabs', initialTab?: LibraryTab) => (
    <FittingLibrary
      workspace={workspace}
      catalogue={catalogue}
      characterId={activeCharacterId}
      inGameKey={inGameFittingsKey}
      onStartHull={(hull) => void workspace.openFitting(newFitting(hull.typeId, hull.name))}
      // Reopening the Fitting already open changes nothing to close on, so
      // an explicit open closes the dialog itself.
      onOpened={() => setLibrary(null)}
      layout={layout}
      initialTab={initialTab}
    />
  );

  if (fitting === null) {
    return (
      <div className="space-y-3">
        <PageHeader title={t('nav.fittings')} />
        {/* A broken share link's message is on the Import tab; start there. */}
        {renderLibrary(isPhone ? 'tabs' : 'page', workspace.shareError ? 'import' : undefined)}
      </div>
    );
  }

  // The docked browser is always there; the others open on demand.
  const addButton =
    addMode === 'docked' ? undefined : (
      <Button size="sm" onClick={() => selectTarget(null)}>
        <AddRow aria-hidden />
        {t('fittings.add.openButton')}
      </Button>
    );

  const editor =
    view === 'ring' ? (
      <div className="min-w-0 space-y-3">
        <FittingRing
          fitting={fitting}
          stats={stats}
          moduleResults={moduleResults}
          unusableModuleKeys={gaps?.unusableModuleKeys}
          typeName={typeName}
          onSlotSelect={selectSlot}
          // Drag is pointer-only: a touch tablet taps a slot and picks instead.
          onDropType={
            isDesktop
              ? (rack, index, typeId) => edit((f) => addModule(f, rack, index, typeId))
              : undefined
          }
          onMoveModule={
            isDesktop ? (rack, from, to) => edit((f) => moveModule(f, rack, from, to)) : undefined
          }
          compact={isPhone}
          onRackOpen={setRackSheet}
          hardpointsUsed={hardpointsUsed}
          moduleActions={
            finePointer
              ? {
                  setState: (rack, index, state) =>
                    edit((f) => setModuleState(f, rack, index, state)),
                  unloadCharge: (rack, index) => edit((f) => setModuleCharge(f, rack, index, null)),
                  showInfo,
                  openVariations: (rack, index) => openModuleDialog(rack, index, true),
                  remove: (rack, index) => edit((f) => removeModule(f, rack, index)),
                }
              : undefined
          }
          selectedSlot={
            target?.kind === 'slot' ? { rack: target.slot, index: target.slotIndex } : null
          }
          actions={addButton}
          droneButton={
            dronesShown ? (
              <Button
                size="md"
                className="w-full justify-between"
                onClick={() => setRackSheet('drone')}
              >
                <span>{t('fittings.list.drones')}</span>
                <span className="text-xs font-normal text-text-dim tabular-nums">
                  {t('fittings.ring.droneCount', droneTotals(fitting))}
                </span>
              </Button>
            ) : undefined
          }
        />
        {/* The phone overview has its Drones button among the rack buttons instead. */}
        {!isPhone && dronesShown && (
          <Panel title={t('fittings.list.drones')}>
            <DroneSection
              fitting={fitting}
              catalogue={catalogue}
              stats={stats}
              edit={edit}
              target={target}
              onSelectTarget={selectTarget}
              onShowInfo={showInfo}
              variant="panel"
            />
          </Panel>
        )}
      </div>
    ) : (
      <FittingRackList
        fitting={fitting}
        stats={stats}
        moduleResults={moduleResults}
        catalogue={catalogue}
        engineReady={workspace.engineReady}
        profile={workspace.profile}
        edit={edit}
        target={target}
        onSelectTarget={selectTarget}
        unusableModuleKeys={gaps?.unusableModuleKeys}
        onOpenVariations={(slot, slotIndex) => openModuleDialog(slot, slotIndex, true)}
        onShowInfo={showInfo}
        actions={addButton}
      />
    );

  const statsSections = (
    <FittingStatsSections
      stats={stats}
      statsProgress={workspace.statsProgress}
      statsError={workspace.statsError}
      statsErrorReason={workspace.statsErrorReason}
      onRetry={workspace.retry}
      price={workspace.price}
      typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
      damageProfiles={workspace.damageProfiles}
      targetProfiles={targetProfiles}
      overlay={overlay}
      showDrones={dronesShown}
      conditions={<AbyssalWeatherPicker />}
      heading={
        <>
          <span>
            {activeCharacterId === null
              ? t('fittings.stats.headingAllV')
              : characterName
                ? t('fittings.stats.headingCharacter', { name: characterName })
                : null}
            {weatherName && ` · ${t('fittings.weather.in', { weather: weatherName })}`}
          </span>
          {workspace.price && (
            <span className="text-text tabular-nums">
              {t('fittings.stats.unit.isk', {
                value: formatIskCompact(workspace.price.totals.sell),
              })}
            </span>
          )}
        </>
      }
    />
  );

  // Under the name: the hull, unless the Fitting is simply named after it,
  // and whether this is a saved Fitting.
  const hullName = typeName(fitting.shipTypeId);
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
    <div className={`space-y-3 ${addOpen && addMode === 'slideOut' ? 'pl-[26rem]' : ''}`}>
      <FittingHeader
        fitting={fitting}
        subtitle={subtitle}
        hasCharacter={activeCharacterId !== null}
        onLibrary={openLibrary}
        onCompare={() => navigate(`/fittings/compare${location.search}`)}
        price={workspace.price}
        // The open slide-out takes 26rem off the page, too little for the one-row header.
        compact={addMode === 'sheet' || (addMode === 'slideOut' && addOpen)}
        context={
          <>
            <ImplantBasisControl
              basis={workspace.implantBasis}
              canUseCloneBasis={workspace.canUseCloneBasis}
              onBasisChange={workspace.setImplantBasis}
              implantSet={fitting.implantSet}
              onImplantSetChange={workspace.setImplantSet}
            />
            {workspace.implantBasis === 'clone' && workspace.canUseCloneBasis && (
              <ImplantsAssumedNote hint={t('fittings.implants.assumesNoImplantsHint')} />
            )}
            <AlphaCloneChip blockers={alpha.blockers} skillName={alpha.skillName} />
            {gaps && gaps.missing.length > 0 && activeCharacterId !== null && (
              <MissingSkillsChip
                entries={gaps.missing}
                characterId={activeCharacterId}
                fittingName={fitting.name}
              />
            )}
          </>
        }
        save={
          <FittingSaveButton
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
            onSaveToEve={() => setSaveToEveOpen(true)}
            canSaveToEve={activeCharacterId !== null && canSaveToEve === true}
            saveToEveBlockedReason={
              activeCharacterId === null
                ? t('fittings.saveToEve.needCharacter')
                : canSaveToEve === false
                  ? t('fittings.saveToEve.needPermission')
                  : undefined
            }
          />
        }
      />
      {workspace.tooLargeToShare && (
        <p role="alert" className="text-xs text-warning">
          {t('fittings.load.tooLargeToShare')}
        </p>
      )}
      {/* Only a Load that opened a Fitting describes this one; a failed Load's
          warnings stay with the Load card that reported them. */}
      {workspace.lastLoad?.kind === 'fitting' && <LoadWarnings load={workspace.lastLoad} />}

      {viewHydrated &&
        (addMode === 'sheet' ? (
          <div className="space-y-3">
            <Tabs
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
            {phoneTab === 'stats' ? statsSections : editor}
          </div>
        ) : (
          <div
            // Docked: browser | Ring | stats. Otherwise the editor beside the
            // stats when wide, but stacked while the slide-out has pushed the
            // page aside, so the editor keeps the width rather than the stats.
            // The Ring goes beside them from the desktop breakpoint — it is
            // capped and square, so it fits beside 22rem of stats there (scope
            // decision `20260925-095734`); the stats hold at 22rem until xl,
            // since a track with a max grows to it before a 1fr one gets
            // anything. The List's rows want the width, so it waits for xl.
            className={`grid items-start gap-3 ${
              addMode === 'docked'
                ? 'grid-cols-[20rem_minmax(0,1fr)_minmax(22rem,26rem)]'
                : addOpen
                  ? 'grid-cols-1'
                  : view === 'ring'
                    ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]'
                    : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]'
            }`}
          >
            {addMode === 'docked' && (
              <Panel
                title={addTitle}
                className="sticky top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto"
              >
                {addPanel}
              </Panel>
            )}
            {/* Ring | List as the app's own tabs over the column they switch. */}
            <div className="min-w-0 space-y-3">
              <Tabs
                tabs={[
                  { id: 'ring', label: t('fittings.view.ring') },
                  { id: 'list', label: t('fittings.view.list') },
                ]}
                value={view}
                onChange={(id) => void setView(id as FittingView)}
                label={t('fittings.view.label')}
              />
              {editor}
            </div>
            {statsSections}
          </div>
        ))}

      {activeCharacterId !== null && (
        <SaveToEveDialog
          open={saveToEveOpen}
          onClose={() => setSaveToEveOpen(false)}
          characterId={activeCharacterId}
          fitting={fitting}
          onSaved={() => setInGameFittingsKey((key) => key + 1)}
        />
      )}
      <Modal
        open={library !== null}
        onClose={() => setLibrary(null)}
        title={t('fittings.header.libraryTitle')}
        placement={isPhone ? 'sheet' : 'wide'}
      >
        {library !== null && renderLibrary('tabs', library)}
      </Modal>
      <Modal
        open={openModule !== null}
        onClose={() => setModuleSlot(null)}
        title={
          openModule
            ? catalogueTypeName(catalogue, openModule.typeId)
            : t(`fittings.list.rack.${moduleSlot?.slot ?? 'high'}`)
        }
        placement={isPhone ? 'sheet' : 'wide'}
      >
        {openModule && (
          <div className="space-y-3">
            <ModuleRow
              module={openModule}
              result={moduleResults?.[openModuleIndex] ?? null}
              cantUse={gaps?.unusableModuleKeys.has(moduleKey(openModule)) ?? false}
              fitting={fitting}
              catalogue={catalogue}
              engineReady={workspace.engineReady}
              profile={workspace.profile}
              edit={edit}
              onShowInfo={showInfo}
            />
            <Disclosure
              label={t('fittings.variations.swapTitle')}
              trailing={variationRows.length > 0 ? String(variationRows.length) : undefined}
              expanded={variationsOpen}
              onToggle={() => setVariationsOpen((open) => !open)}
              className="rounded-xs border border-line"
            >
              <div className="p-2">
                <FittingVariationsPanel rows={variationRows} onSelect={swapVariation} />
              </div>
            </Disclosure>
          </div>
        )}
      </Modal>
      {isPhone && (
        <Modal
          open={rackSheet !== null}
          onClose={() => setRackSheet(null)}
          title={
            rackSheet === 'drone'
              ? t('fittings.list.drones')
              : t(`fittings.list.rack.${rackSheet ?? 'high'}`)
          }
          placement="sheet"
        >
          {rackSheet === 'drone' && (
            <DroneSection
              fitting={fitting}
              catalogue={catalogue}
              stats={stats}
              edit={edit}
              target={target}
              onSelectTarget={selectTargetFromSheet}
              onShowInfo={showInfo}
              variant="panel"
            />
          )}
          {rackSheet && rackSheet !== 'drone' && (
            <RackSlots
              rack={rackSheet}
              hideLabel
              fitting={fitting}
              catalogue={catalogue}
              engineReady={workspace.engineReady}
              profile={workspace.profile}
              edit={edit}
              stats={stats}
              moduleResults={moduleResults}
              target={target}
              onSelectTarget={selectTargetFromSheet}
              unusableModuleKeys={gaps?.unusableModuleKeys}
              onShowInfo={showInfo}
              onOpenVariations={(slot, slotIndex) => {
                setRackSheet(null);
                openModuleDialog(slot, slotIndex, true);
              }}
            />
          )}
        </Modal>
      )}
      {infoItem && (
        <ItemDetailModal
          typeId={infoItem.typeId}
          itemName={infoItem.name}
          onClose={() => setInfoItem(null)}
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
    </div>
  );
}
