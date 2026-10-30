import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { BuildPlanRecord } from '@/db';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { craftScope } from '@/engine/industry/craftScope';
import { hasShoppingList } from '@/engine/industry/shoppingList';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import { nameForType, volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import type { buildItemMenuProps } from './buildItemMenuProps';
import type { CorpOwnedStockState } from './corpOwnedStock';
import { MaterialsTable, type MaterialsTableHandle } from './MaterialsTable';
import { PlanMaterialModals } from './PlanMaterialModals';
import { PlanMaterialsActions } from './PlanMaterialsActions';
import { PlanMaterialsControls } from './PlanMaterialsControls';
import { planSourcingPatches } from './planMaterialsView';
import type { PlanPatch } from './planPatch';
import type { MaterialTableRow } from './subBuildPlan';
import type { useMaterialModals } from './useMaterialModals';
import type { usePlanEdits } from './usePlanEdits';
import type { PlanGroup, usePlanOwnedStock } from './usePlanOwnedStock';
import type { usePlanMaterials } from './usePlanMaterials';
import type { useOwnedSale } from './useOwnedSale';
import type { useShoppingListCopy } from './useShoppingListCopy';

type Edits = ReturnType<typeof usePlanEdits>;

interface PlanMaterialsPanelProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  hub: TradeHub;
  activity: IndustryActivity;
  result: BuildResult | null;
  error: string | null | undefined;
  fetchedAt: Date | null;
  pricesReady: boolean;
  materials: ReturnType<typeof usePlanMaterials>;
  ownedStock: ReturnType<typeof usePlanOwnedStock>;
  ownedForSale: NonNullable<ReturnType<typeof useOwnedSale>>['instant'] | null;
  corpOwnedStock: CorpOwnedStockState;
  group: PlanGroup | null;
  canBuildHere: (typeID: number) => boolean;
  autoBuild: {
    maxDepth: number;
    craftScopeList: ReturnType<typeof craftScope>;
    disabled: boolean;
    onApply: (options: { strategy: BuildStrategy }) => void;
  };
  shopping: ReturnType<typeof useShoppingListCopy>;
  materialsExport: UseTableExport<MaterialTableRow>;
  materialsTable: RefObject<MaterialsTableHandle | null>;
  modals: ReturnType<typeof useMaterialModals>;
  itemMenuFor: ReturnType<typeof buildItemMenuProps>['itemMenuFor'];
  itemActionsFor: ReturnType<typeof buildItemMenuProps>['itemActionsFor'];
  update: (patch: PlanPatch) => void;
  changeSourcing: Edits['changeSourcing'];
  changeOneSourcing: Edits['changeOneSourcing'];
  toggleBuildHere: Edits['toggleBuildHere'];
  buildHereAll: Edits['buildHereAll'];
  onRefresh: () => void;
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
}

/** The Materials panel: its header actions, the owned-stock controls, the table, its dialogs and the sub-build summary. */
export function PlanMaterialsPanel({
  plan,
  catalog,
  hub,
  activity,
  result,
  error,
  fetchedAt,
  pricesReady,
  materials,
  ownedStock,
  ownedForSale,
  corpOwnedStock,
  group,
  canBuildHere,
  autoBuild,
  shopping,
  materialsExport,
  materialsTable,
  modals,
  itemMenuFor,
  itemActionsFor,
  update,
  changeSourcing,
  changeOneSourcing,
  toggleBuildHere,
  buildHereAll,
  onRefresh,
  onSearchBpcSourcing,
}: PlanMaterialsPanelProps) {
  const { t } = useTranslation();
  const {
    visibleMaterials,
    shoppingMaterials,
    boughtDepth,
    anySubBuilds,
    subBuildTimeSeconds,
    materialAdvice,
    builtTopLevel,
    subBuildTotal,
    buyInsteadTotal,
  } = materials;
  return (
    <Panel
      title={t('industry.materials')}
      actions={
        <PlanMaterialsActions
          fetchedAt={fetchedAt}
          copyState={shopping.copyState}
          copyDisabled={!!error || !result || !hasShoppingList(shoppingMaterials)}
          onCopy={() => void shopping.copyShoppingList()}
          showExport={!error && !!result && visibleMaterials.length > 0}
          materialsExport={materialsExport}
          onRefresh={onRefresh}
        />
      }
    >
      {error || !result ? (
        <p className="text-xs text-danger">{error ?? t('industry.computeError')}</p>
      ) : (
        <>
          {/* Reactions are exempt from every time implant — nothing to assume. */}
          {activity !== 'reaction' && (
            <ImplantsAssumedNote hint={t('industry.assumesNoImplantsHint')} />
          )}
          <PlanMaterialsControls
            plan={plan}
            catalog={catalog}
            visibleMaterials={visibleMaterials}
            autoBuildMaxDepth={autoBuild.maxDepth}
            craftScopeList={autoBuild.craftScopeList}
            autoBuildDisabled={autoBuild.disabled}
            onApplyAutoBuild={autoBuild.onApply}
            corpOwnedStock={corpOwnedStock}
            ownedStock={ownedStock}
            materialsTable={materialsTable}
            group={group}
            update={update}
          />
          <MaterialsTable
            exportProps={materialsExport.tableProps}
            itemMenuFor={itemMenuFor}
            itemActionsFor={itemActionsFor}
            materials={visibleMaterials}
            nameFor={(typeID) => nameForType(catalog, typeID)}
            volumeFor={(typeID) => volumeForType(catalog, typeID)}
            sourcing={plan.materialSourcing}
            pricesReady={pricesReady}
            onSourcingChange={changeOneSourcing}
            onOwnedStockChange={(changes) => changeSourcing(planSourcingPatches(changes))}
            ref={materialsTable}
            detection={ownedStock.detection}
            groupClaimsFor={ownedStock.groupClaimsFor}
            makeOrBuy={materialAdvice}
            canBuildHere={canBuildHere}
            onToggleBuildHere={toggleBuildHere}
            onBuildAll={buildHereAll}
            onBuyOre={modals.hasShortfall ? () => modals.setBuyOreOpen(true) : undefined}
            ownedSellNet={ownedForSale?.net ?? null}
            sellValueFor={(typeID) =>
              ownedForSale?.lines.find((line) => line.typeID === typeID)?.net
            }
            onShowRecipe={modals.setRecipeTypeId}
            onShowUsedBy={anySubBuilds ? modals.setUsedByTypeId : undefined}
            onOpenAcquisitionPicker={modals.setAcquisitionPickerTypeId}
            skillGates={ownedStock.skillGates}
            characterNameFor={ownedStock.detection.characterNameFor}
            depthFor={(typeID) => boughtDepth.get(typeID)}
          />
          <PlanMaterialModals
            modals={modals}
            result={result}
            plan={plan}
            catalog={catalog}
            hub={hub}
            itemMenuFor={itemMenuFor}
            itemActionsFor={itemActionsFor}
            changeOneSourcing={changeOneSourcing}
            update={update}
            onSearchBpcSourcing={onSearchBpcSourcing}
          />
          {/*
          What building the chosen material(s) actually costs — already
          folded into the Results panel's totals below, at whatever depth
          they were built to (docs/context/decisions, since superseded:
          the two panels used to disagree the moment a build was
          toggled). The "buying instead" comparison only appears when
          every built material genuinely has a hub price to compare
          against; silently pricing an unsold item as free was the bug
          this replaces.
        */}
          {anySubBuilds && (
            <p className="mt-3 border-t border-line pt-2 text-[0.6875rem] text-text-dim">
              {/*
                Counted over the plan's own materials, not over every
                built row in the flat table: `subBuildTotal` and the
                "buying them instead" comparison beside it are both
                top-level sums, and a count of a different set in the same
                sentence reads as a count of those. What the deeper jobs
                cost is inside the total already.
              */}
              {t('industry.subBuildSummary', {
                count: builtTopLevel.length,
                total: formatIsk(subBuildTotal),
              })}{' '}
              {buyInsteadTotal !== null &&
                t('industry.subBuildSummaryComparison', {
                  planned: formatIsk(buyInsteadTotal),
                })}{' '}
              {t('industry.subBuildTimeNote', { time: formatDuration(subBuildTimeSeconds) })}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
