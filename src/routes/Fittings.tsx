import { useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Modal, PageHeader, Panel } from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { FittingSlotKind } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addDrones,
  addModule,
  firstFreeSlotIndex,
  moveModule,
  swapModuleType,
} from '@/engine/fittings/fittingEdit';
import { FittingAddPanel } from '@/features/fittings/FittingAddPanel';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { MyFittingsPanel } from '@/features/fittings/MyFittingsPanel';
import { FittingExportMenu } from '@/features/fittings/FittingExportMenu';
import { FittingLoadCard } from '@/features/fittings/FittingLoadCard';
import { InGameFittingsPanel } from '@/features/fittings/InGameFittingsPanel';
import { SaveToEveDialog } from '@/features/fittings/SaveToEveDialog';
import { FittingRackList, ModuleRow, RackSlots } from '@/features/fittings/FittingRackList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { FittingVariationsPanel } from '@/features/fittings/FittingVariationsPanel';
import { FittingViewToggle } from '@/features/fittings/FittingViewToggle';
import {
  resolveFittingView,
  useFittingViewPreference,
} from '@/features/fittings/fittingViewPreference';
import { MissingSkillsChip } from '@/features/fittings/MissingSkillsChip';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import { useFittingCatalogue } from '@/features/fittings/useFittingCatalogue';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';
import { useModuleVariations } from '@/features/fittings/useModuleVariations';

/**
 * The Fittings section: paste EFT to Load a Fitting, then edit it in the List
 * view — tap an empty slot to add there, from a docked Add panel on desktop
 * or a search sheet on phone. The Ring view is the same editor as a
 * game-style ring — its Ring | List choice is device-local (Ring on desktop,
 * List on a phone) and on a phone the Ring's stats live in a bottom sheet.
 * The My clone vs Fitting's implant/booster toggle lives in List view's
 * header; everything else the scope decision lists lands in its own ticket.
 */
export function Fittings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const isDesktop = useIsDesktop();
  const [target, setTarget] = useState<AddTarget | null>(null);
  // Phone only: the Add sheet. Opened by an empty slot, or by the search
  // button — which works before the ship data (and so the empty slots) exists.
  const [sheetOpen, setSheetOpen] = useState(false);
  const isPhone = useIsPhone();
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useFittingViewPreference((state) => state.hydrated);
  const hydrateView = useFittingViewPreference((state) => state.hydrate);
  const setView = useFittingViewPreference((state) => state.setValue);
  useEffect(() => {
    void hydrateView();
  }, [hydrateView]);
  const view = resolveFittingView(storedView, isPhone);
  const [statsOpen, setStatsOpen] = useState(false);
  // Phone Ring: the rack whose slots sheet is open (scope decision `20260924-205720`).
  const [rackSheet, setRackSheet] = useState<FittingSlotKind | null>(null);
  // Ring view: the filled slot whose module panel is open.
  const [moduleSlot, setModuleSlot] = useState<{ slot: FittingSlotKind; slotIndex: number } | null>(
    null
  );
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);
  const [saveToEveOpen, setSaveToEveOpen] = useState(false);
  // Bumped on a successful Save to EVE so InGameFittingsPanel remounts and
  // refetches, picking up the fitting that just landed (or the overwrite).
  const [inGameFittingsKey, setInGameFittingsKey] = useState(0);
  const canSaveToEve = useEndpointsGranted(['postCharacterFitting']);

  const { fitting, stats, edit } = workspace;
  const slotCounts = stats?.slotCounts ?? null;
  // Module results only line up with the Fitting they were calculated for.
  const moduleResults = stats !== null && workspace.statsFitting === fitting ? stats.modules : null;

  function canPlace(rack: CandidateRack): boolean {
    if (rack === 'drone') return true;
    if (fitting === null || slotCounts === null) return false;
    if (target?.kind === 'slot' && target.slot === rack) return true;
    return firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null;
  }

  function handleAdd(typeId: number, rack: CandidateRack) {
    if (rack === 'drone') {
      edit((f) => addDrones(f, typeId, 1), `drone-add-${typeId}`);
      if (!isDesktop) closeSheet();
      return;
    }
    if (slotCounts === null) return;
    const count = slotCounts[rack];
    // Desktop keeps the panel on the rack's next empty slot, so a row of
    // modules goes in one click each. An item for another rack (fits-this-slot
    // off) goes in that rack's first free slot and leaves the chosen one be.
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
    if (isDesktop) setTarget(after.target);
    else closeSheet();
  }

  function selectSlot(slot: FittingSlotKind, slotIndex: number) {
    const filled = fitting?.modules.some((m) => m.slot === slot && m.slotIndex === slotIndex);
    if (filled) setModuleSlot({ slot, slotIndex });
    else selectTarget({ kind: 'slot', slot, slotIndex });
  }

  function selectTarget(next: AddTarget) {
    setTarget(next);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
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
      showGroups={isDesktop}
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
  const statsInSheet = view === 'ring' && isPhone;
  const statsSections = (
    <FittingStatsSections
      stats={stats}
      statsProgress={workspace.statsProgress}
      statsError={workspace.statsError}
      price={workspace.price}
      damageProfiles={workspace.damageProfiles}
    />
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('nav.fittings')}
        actions={
          fitting ? (
            <div className="flex items-center gap-2">
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
                  ? t('fittings.myFittings.save')
                  : t('fittings.myFittings.update')}
              </Button>
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
              <FittingExportMenu fitting={fitting} price={workspace.price} />
              {viewHydrated && (
                <FittingViewToggle value={view} onChange={(next) => void setView(next)} />
              )}
              <Button onClick={() => navigate(`/fittings/compare${location.search}`)}>
                {t('fittings.compare.entryButton')}
              </Button>
            </div>
          ) : undefined
        }
      />
      <FittingLoadCard
        onLoad={workspace.loadFromInput}
        unresolved={workspace.unresolved}
        fitXmlUnresolved={workspace.fitXmlUnresolved}
        shareError={workspace.shareError}
        loadError={workspace.loadError}
        tooLargeToShare={workspace.tooLargeToShare}
        onLoadFittingXmlDocument={workspace.loadFittingXmlDocument}
        onOpenFittingXmlEntry={workspace.openFittingXmlEntry}
      />
      {activeCharacterId !== null && (
        <InGameFittingsPanel
          key={inGameFittingsKey}
          characterId={activeCharacterId}
          onOpen={(loaded) => void workspace.openFitting(loaded)}
        />
      )}
      <MyFittingsPanel characterId={activeCharacterId} onOpen={workspace.openSaved} />
      {fitting && activeCharacterId !== null && (
        <SaveToEveDialog
          open={saveToEveOpen}
          onClose={() => setSaveToEveOpen(false)}
          characterId={activeCharacterId}
          fitting={fitting}
          onSaved={() => setInGameFittingsKey((key) => key + 1)}
        />
      )}
      {fitting && viewHydrated && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            {!isDesktop && (
              <Button className="w-full" onClick={() => setSheetOpen(true)}>
                {t('fittings.add.searchLabel')}
              </Button>
            )}
            {gaps && gaps.missing.length > 0 && activeCharacterId !== null && (
              <MissingSkillsChip
                entries={gaps.missing}
                characterId={activeCharacterId}
                fittingName={fitting.name}
              />
            )}
            {view === 'ring' ? (
              <FittingRing
                fitting={fitting}
                stats={stats}
                unusableModuleKeys={gaps?.unusableModuleKeys}
                typeName={(typeId) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`}
                onSlotSelect={selectSlot}
                // Drag is pointer-only: a touch tablet taps a slot and picks instead.
                onDropType={
                  isDesktop
                    ? (rack, index, typeId) => edit((f) => addModule(f, rack, index, typeId))
                    : undefined
                }
                onMoveModule={
                  isDesktop
                    ? (rack, from, to) => edit((f) => moveModule(f, rack, from, to))
                    : undefined
                }
                compact={isPhone}
                onRackOpen={setRackSheet}
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
                implantBasis={workspace.implantBasis}
                canUseCloneBasis={workspace.canUseCloneBasis}
                onImplantBasisChange={workspace.setImplantBasis}
                onImplantSetChange={workspace.setImplantSet}
              />
            )}
            {statsInSheet && (
              <Button className="min-h-11 w-full" onClick={() => setStatsOpen(true)}>
                {t('fittings.ring.openStats')}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {isDesktop && <Panel title={addTitle}>{addPanel}</Panel>}
            {!statsInSheet && statsSections}
          </div>
        </div>
      )}
      {statsInSheet && (
        <Modal
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          title={t('fittings.ring.openStats')}
          placement="sheet"
        >
          {statsSections}
        </Modal>
      )}
      {fitting && (
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
      )}
      {fitting && isPhone && (
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
      {!isDesktop && (
        <Modal
          open={fitting !== null && sheetOpen}
          onClose={closeSheet}
          placement="sheet"
          title={addTitle}
        >
          {addPanel}
        </Modal>
      )}
    </div>
  );
}
