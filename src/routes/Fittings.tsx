import { useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { Button, Modal, PageHeader, Panel } from '@/components/ui';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { addDrones, addModule, firstFreeSlotIndex } from '@/engine/fittings/fittingEdit';
import { FittingAddPanel } from '@/features/fittings/FittingAddPanel';
import { targetRack, type AddTarget } from '@/features/fittings/addTarget';
import { FittingLoadCard } from '@/features/fittings/FittingLoadCard';
import { FittingRackList } from '@/features/fittings/FittingRackList';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { MissingSkillsChip } from '@/features/fittings/MissingSkillsChip';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import { useFittingCatalogue } from '@/features/fittings/useFittingCatalogue';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';

/**
 * The Fittings section: paste EFT to Load a Fitting (#1532), then edit it in
 * the List view (#1533) — tap an empty slot to add there, from a docked Add
 * panel on desktop or a search sheet on phone. The Ring view (#1536),
 * implants (#1535) and everything else the scope decision lists land in
 * their own tickets.
 */
export function Fittings() {
  const { t } = useTranslation();
  const workspace = useFittingWorkspace();
  const catalogue = useFittingCatalogue();
  const isDesktop = useIsDesktop();
  const [target, setTarget] = useState<AddTarget | null>(null);
  // Phone only: the Add sheet. Opened by an empty slot, or by the search
  // button — which works before the ship data (and so the empty slots) exists.
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);

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
    />
  );

  return (
    <div className="space-y-3">
      <PageHeader title={t('nav.fittings')} />
      <FittingLoadCard
        onLoad={workspace.loadFromEftText}
        unresolved={workspace.unresolved}
        shareError={workspace.shareError}
        tooLargeToShare={workspace.tooLargeToShare}
      />
      {fitting && (
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
            />
          </div>
          <div className="space-y-3">
            {isDesktop && <Panel title={addTitle}>{addPanel}</Panel>}
            <FittingStatsSections
              stats={stats}
              statsProgress={workspace.statsProgress}
              statsError={workspace.statsError}
              price={workspace.price}
            />
          </div>
        </div>
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
