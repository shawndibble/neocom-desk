import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { Well } from '@/components/ui/Well';
import { GAS_DECOMPRESSION_YIELD } from '@/engine/industry/compressedGas';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { BuildPlanRecord } from '@/db';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { craftScope } from '@/engine/industry/craftScope';
import { hasShoppingList } from '@/engine/industry/shoppingList';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatVolume } from './format';
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
          copyDisabled={!!error || !result || !hasShoppingList(shopping.shoppingMaterials)}
          onCopy={() => void shopping.copyShoppingList()}
          compressedGas={
            shopping.hasGas
              ? { checked: shopping.compressedGas, onChange: shopping.setCompressedGas }
              : undefined
          }
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
          {shopping.compressedGas && (
            <Well className="mb-2 text-xs text-text-dim" data-testid="compressed-gas-comparison">
              {shopping.gasComparison && shopping.gasComparison.pricedRawUnits > 0
                ? t('industry.compressedGasCompare', {
                    yield: `${Math.round(GAS_DECOMPRESSION_YIELD * 100)}%`,
                    rawCost: formatIsk(shopping.gasComparison.rawCost),
                    compressedCost: formatIsk(shopping.gasComparison.compressedCost),
                    rawPerUnit: formatIsk(
                      shopping.gasComparison.rawCost / shopping.gasComparison.pricedRawUnits
                    ),
                    compressedPerUnit: formatIsk(
                      shopping.gasComparison.compressedCost / shopping.gasComparison.pricedRawUnits
                    ),
                    rawVolume: formatVolume(shopping.gasComparison.rawVolume),
                    compressedVolume: formatVolume(shopping.gasComparison.compressedVolume),
                  })
                : t('industry.compressedGasYieldOnly', {
                    yield: `${Math.round(GAS_DECOMPRESSION_YIELD * 100)}%`,
                  })}
              {shopping.gasComparison &&
                !shopping.gasComparison.priced &&
                ` ${t('industry.compressedGasPartial')}`}
            </Well>
          )}
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
          {anySubBuilds && (
            <p className="mt-3 border-t border-line pt-2 text-[0.6875rem] text-text-dim">
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
