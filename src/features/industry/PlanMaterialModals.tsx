import type { BuildPlanRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { BlueprintAcquisitionModal } from './BlueprintAcquisitionModal';
import { BuildRecipeModal } from './BuildRecipeModal';
import { BuyOreDialog } from './buyOre/BuyOreDialog';
import type { buildItemMenuProps } from './buildItemMenuProps';
import type { PlanPatch } from './planPatch';
import type { useMaterialModals } from './useMaterialModals';
import type { usePlanEdits } from './usePlanEdits';

interface PlanMaterialModalsProps {
  modals: ReturnType<typeof useMaterialModals>;
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  hub: TradeHub;
  itemMenuFor: ReturnType<typeof buildItemMenuProps>['itemMenuFor'];
  itemActionsFor: ReturnType<typeof buildItemMenuProps>['itemActionsFor'];
  changeOneSourcing: ReturnType<typeof usePlanEdits>['changeOneSourcing'];
  update: (patch: PlanPatch) => void;
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
}

/** The three dialogs the Materials table opens: Buy ore, a built row's recipe, and the blueprint acquisition picker. */
export function PlanMaterialModals({
  modals,
  plan,
  catalog,
  hub,
  itemMenuFor,
  itemActionsFor,
  changeOneSourcing,
  update,
  onSearchBpcSourcing,
}: PlanMaterialModalsProps) {
  const { acquisitionPickerTypeId } = modals;
  return (
    <>
      {modals.buyOreOpen && (
        <BuyOreDialog
          open
          onClose={() => modals.setBuyOreOpen(false)}
          hub={hub}
          needs={modals.shortfall.needs}
          mineralsTotal={modals.shortfall.total}
        />
      )}
      <BuildRecipeModal
        recipe={modals.openRecipe}
        onClose={() => modals.setRecipeTypeId(null)}
        nameFor={(typeID) => nameForType(catalog, typeID)}
        onOpenRecipe={modals.setRecipeTypeId}
        itemMenuFor={itemMenuFor}
        itemActionsFor={itemActionsFor}
      />
      {acquisitionPickerTypeId !== null && (
        <BlueprintAcquisitionModal
          onClose={() => modals.setAcquisitionPickerTypeId(null)}
          characterId={plan.characterId}
          blueprintTypeID={acquisitionPickerTypeId}
          blueprintName={nameForType(catalog, acquisitionPickerTypeId)}
          itemMenuFor={itemMenuFor}
          itemActionsFor={itemActionsFor}
          ownedCopies={modals.acquisitionPickerOwnedCopies}
          sourcing={plan.materialSourcing?.[acquisitionPickerTypeId]}
          onSourcingChange={changeOneSourcing}
          onPickRuns={
            acquisitionPickerTypeId === plan.blueprintTypeID
              ? (runs) => update({ runs })
              : undefined
          }
          onSearchBpcSourcing={onSearchBpcSourcing}
          planHubId={plan.hubId}
          invention={modals.acquisitionPickerInvention}
        />
      )}
    </>
  );
}
