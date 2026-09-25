import { useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { Button, Modal, PageHeader, Panel, SlideOver, Tabs } from '@/components/ui';
import { AddRow } from '@/components/ui/icons';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingSlotKind } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addDrones,
  addModule,
  firstFreeSlotIndex,
  moveModule,
  newFitting,
  swapModuleType,
} from '@/engine/fittings/fittingEdit';
import { FittingAddPanel } from '@/features/fittings/FittingAddPanel';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { FittingExportMenu } from '@/features/fittings/FittingExportMenu';
import { FittingHeader } from '@/features/fittings/FittingHeader';
import { FittingKpiStrip } from '@/features/fittings/FittingKpiStrip';
import { LoadWarnings } from '@/features/fittings/FittingLoadCard';
import { FittingLibrary, type LibraryTab } from '@/features/fittings/FittingLibrary';
import { SaveToEveDialog } from '@/features/fittings/SaveToEveDialog';
import { FittingRackList, ModuleRow, RackSlots } from '@/features/fittings/FittingRackList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { FittingVariationsPanel } from '@/features/fittings/FittingVariationsPanel';
import { FittingViewToggle } from '@/features/fittings/FittingViewToggle';
import { ImplantBasisControl } from '@/features/fittings/ImplantBasisControl';
import {
  resolveFittingView,
  useFittingViewPreference,
} from '@/features/fittings/fittingViewPreference';
import { MissingSkillsChip } from '@/features/fittings/MissingSkillsChip';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import { catalogueTypeName, useFittingCatalogue } from '@/features/fittings/useFittingCatalogue';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';
import { useModuleVariations } from '@/features/fittings/useModuleVariations';
import { useOverlayFitting } from '@/features/fittings/useOverlayFitting';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { useMediaQuery } from '@/lib/useMediaQuery';

/**
 * Wide enough for browser | Ring | stats side by side: the 12rem nav, a 20rem
 * browser, a Ring column wide enough for its corner readouts (~41rem), and
 * 22rem of stats, with gaps and page padding.
 */
const THREE_COLUMN_QUERY = '(min-width: 100rem)';

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
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const threeColumns = useMediaQuery(THREE_COLUMN_QUERY);
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
  const [phoneTab, setPhoneTab] = useState<'fitting' | 'stats'>('fitting');
  // Phone Ring: the rack whose slots sheet is open (scope decision `20260924-205720`).
  const [rackSheet, setRackSheet] = useState<FittingSlotKind | null>(null);
  // The filled slot whose module panel is open.
  const [moduleSlot, setModuleSlot] = useState<{ slot: FittingSlotKind; slotIndex: number } | null>(
    null
  );
  // The Fittings menu's dialog, and the Fitting it was opened over: opening
  // any other Fitting from it closes it (adjusted during render, not in an effect).
  const [library, setLibrary] = useState<LibraryTab | null>(null);
  const [libraryOver, setLibraryOver] = useState<Fitting | null>(null);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);
  const [saveToEveOpen, setSaveToEveOpen] = useState(false);
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
  // Module results only line up with the Fitting they were calculated for.
  const moduleResults = stats !== null && workspace.statsFitting === fitting ? stats.modules : null;
  const typeName = (typeId: number) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;

  function openLibrary(tab: LibraryTab) {
    setLibraryOver(fitting);
    setLibrary(tab);
  }

  function canPlace(rack: CandidateRack): boolean {
    if (rack === 'drone') return true;
    if (fitting === null || slotCounts === null) return false;
    if (target?.kind === 'slot' && target.slot === rack) return true;
    return firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null;
  }

  function handleAdd(typeId: number, rack: CandidateRack) {
    if (rack === 'drone') {
      edit((f) => addDrones(f, typeId, 1), `drone-add-${typeId}`);
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
    if (filled) setModuleSlot({ slot, slotIndex });
    else selectTarget({ kind: 'slot', slot, slotIndex });
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
      showGroups={addMode !== 'sheet'}
      dragToRing={isDesktop && view === 'ring'}
    />
  );

  const openModuleIndex = moduleSlot
    ? (fitting?.modules.findIndex(
        (m) => m.slot === moduleSlot.slot && m.slotIndex === moduleSlot.slotIndex
      ) ?? -1)
    : -1;
  const openModule = fitting && openModuleIndex >= 0 ? fitting.modules[openModuleIndex] : null;
  const { rows: variationRows } = useModuleVariations({
    fitting,
    slot: moduleSlot?.slot ?? 'high',
    slotIndex: moduleSlot?.slotIndex ?? 0,
    typeId: openModule?.typeId ?? 0,
    catalogue,
    engineReady: workspace.engineReady,
    profile: workspace.profile,
    damageProfile: workspace.damageProfiles.selected,
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
      <FittingRing
        fitting={fitting}
        stats={stats}
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
        actions={addButton}
      />
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
        onOpenVariations={(slot, slotIndex) => setModuleSlot({ slot, slotIndex })}
        actions={addButton}
      />
    );

  const statsSections = (
    <FittingStatsSections
      stats={stats}
      statsProgress={workspace.statsProgress}
      statsError={workspace.statsError}
      price={workspace.price}
      typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
      damageProfiles={workspace.damageProfiles}
      targetProfiles={targetProfiles}
      overlay={overlay}
    />
  );

  return (
    // The open slide-out pushes the page aside rather than covering it, so
    // every Ring slot stays a drop target. (It can't get out of the way
    // mid-drag instead: moving or hiding a drag's source element cancels it.)
    <div className={`space-y-3 ${addOpen && addMode === 'slideOut' ? 'pl-[26rem]' : ''}`}>
      <section className="border border-line bg-panel">
        <FittingHeader
          fitting={fitting}
          hullName={typeName(fitting.shipTypeId)}
          hasCharacter={activeCharacterId !== null}
          onLibrary={openLibrary}
          context={
            <>
              <ImplantBasisControl
                basis={workspace.implantBasis}
                canUseCloneBasis={workspace.canUseCloneBasis}
                onBasisChange={workspace.setImplantBasis}
                implantSet={fitting.implantSet}
                onImplantSetChange={workspace.setImplantSet}
              />
              {gaps && gaps.missing.length > 0 && activeCharacterId !== null && (
                <MissingSkillsChip
                  entries={gaps.missing}
                  characterId={activeCharacterId}
                  fittingName={fitting.name}
                />
              )}
            </>
          }
          actions={
            <>
              {viewHydrated && (
                <FittingViewToggle value={view} onChange={(next) => void setView(next)} />
              )}
              <FittingExportMenu fitting={fitting} price={workspace.price} />
              <Button
                disabled={activeCharacterId === null || canSaveToEve !== true}
                title={
                  activeCharacterId === null
                    ? t('fittings.saveToEve.needCharacter')
                    : canSaveToEve === false
                      ? t('fittings.saveToEve.needPermission')
                      : undefined
                }
                onClick={() => setSaveToEveOpen(true)}
              >
                {t('fittings.saveToEve.action')}
              </Button>
              <Button
                variant="primary"
                disabled={!workspace.canSave}
                title={
                  activeCharacterId === null
                    ? t('fittings.myFittings.needCharacter')
                    : workspace.tooLargeToShare
                      ? t('fittings.myFittings.tooLarge')
                      : undefined
                }
                onClick={() => void workspace.save()}
              >
                {workspace.savedId === null
                  ? t(isPhone ? 'fittings.myFittings.saveShort' : 'fittings.myFittings.save')
                  : t('fittings.myFittings.update')}
              </Button>
            </>
          }
        />
        {workspace.tooLargeToShare && (
          <p role="alert" className="px-3 pb-2 text-xs text-warning">
            {t('fittings.load.tooLargeToShare')}
          </p>
        )}
        {(workspace.unresolved.length > 0 || workspace.fitXmlUnresolved.length > 0) && (
          <div className="space-y-2 px-3 pb-2">
            <LoadWarnings
              unresolved={workspace.unresolved}
              fitXmlUnresolved={workspace.fitXmlUnresolved}
            />
          </div>
        )}
        <FittingKpiStrip stats={stats} price={workspace.price} />
      </section>

      {viewHydrated &&
        (addMode === 'sheet' ? (
          <div className="space-y-3">
            <Tabs
              tabs={[
                { id: 'fitting', label: t('fittings.phoneTabs.fitting') },
                { id: 'stats', label: t('fittings.phoneTabs.stats') },
              ]}
              value={phoneTab}
              onChange={(id) => setPhoneTab(id as 'fitting' | 'stats')}
              label={t('fittings.phoneTabs.label')}
            />
            {phoneTab === 'fitting' ? editor : statsSections}
          </div>
        ) : (
          <div
            // Docked: browser | Ring | stats. Otherwise Ring beside stats when
            // wide, but stacked while the slide-out has pushed the page aside,
            // so the Ring keeps the width rather than the stats.
            className={`grid items-start gap-3 ${
              addMode === 'docked'
                ? 'grid-cols-[20rem_minmax(0,1fr)_minmax(22rem,26rem)]'
                : addOpen
                  ? 'grid-cols-1'
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
            {editor}
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
        title={t(`fittings.list.rack.${moduleSlot?.slot ?? 'high'}`)}
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
            />
            <div>
              <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('fittings.variations.title')}
              </p>
              <FittingVariationsPanel rows={variationRows} onSelect={swapVariation} />
            </div>
          </div>
        )}
      </Modal>
      {isPhone && (
        <Modal
          open={rackSheet !== null}
          onClose={() => setRackSheet(null)}
          title={t(`fittings.list.rack.${rackSheet ?? 'high'}`)}
          placement="sheet"
        >
          {rackSheet && (
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
              onSelectTarget={(next) => {
                // One sheet at a time: the Add sheet takes over from the rack's.
                setRackSheet(null);
                selectTarget(next);
              }}
              unusableModuleKeys={gaps?.unusableModuleKeys}
            />
          )}
        </Modal>
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
