import type { RefObject } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { craftScope } from '@/engine/industry/craftScope';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { BuildPlanAutoBuildControl } from './BuildPlanAutoBuildControl';
import type { CorpOwnedStockState } from './corpOwnedStock';
import { GroupOwnedDiffersHint } from './GroupOwnedDiffersHint';
import type { MaterialsTableHandle } from './MaterialsTable';
import { PlanOwnedStockControl } from './PlanOwnedStockControl';
import { groupOwnedDifference } from './planMaterialsView';
import type { PlanPatch } from './planPatch';
import type { MaterialTableRow } from './subBuildPlan';
import type { PlanGroup, usePlanOwnedStock } from './usePlanOwnedStock';

interface PlanMaterialsControlsProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  visibleMaterials: readonly MaterialTableRow[];
  autoBuildMaxDepth: number;
  craftScopeList: ReturnType<typeof craftScope>;
  autoBuildDisabled: boolean;
  onApplyAutoBuild: (options: { strategy: BuildStrategy }) => void;
  corpOwnedStock: CorpOwnedStockState;
  ownedStock: ReturnType<typeof usePlanOwnedStock>;
  materialsTable: RefObject<MaterialsTableHandle | null>;
  group: PlanGroup | null;
  update: (patch: PlanPatch) => void;
}

/**
 * Lives in the Materials panel, not in the settings block above it: it
 * governs one number in one column of the table below it — the owned quantity
 * "use detected" offers — and nothing else on the plan. Beside Facility and
 * Trade hub it read as another thing about where the job runs.
 */
export function PlanMaterialsControls({
  plan,
  catalog,
  visibleMaterials,
  autoBuildMaxDepth,
  craftScopeList,
  autoBuildDisabled,
  onApplyAutoBuild,
  corpOwnedStock,
  ownedStock,
  materialsTable,
  group,
  update,
}: PlanMaterialsControlsProps) {
  return (
    <div className="mb-3 flex flex-col gap-3">
      {/*
        One row, two labelled groups: the strategy applies the moment
        it is picked (Undo in the toast), and everything about which
        owned stock the table counts sits behind one Owned button —
        read once per plan, not on every visit.
      */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <BuildPlanAutoBuildControl
          maxDepth={autoBuildMaxDepth}
          scope={craftScopeList}
          disabled={autoBuildDisabled}
          onApply={onApplyAutoBuild}
        />
        <PlanOwnedStockControl
          scope={plan.ownedStockScope}
          includeCorpAssets={plan.includeCorpAssets ?? false}
          corpAvailable={corpOwnedStock.available}
          detectedStock={ownedStock.detectedStock}
          detection={ownedStock.detection}
          onScopeChange={(ownedStockScope) => update({ ownedStockScope })}
          onIncludeCorpAssetsChange={(include) => update({ includeCorpAssets: include })}
          onFillAll={() => materialsTable.current?.fillAll()}
          onClearAll={() => materialsTable.current?.clearAll()}
        />
      </div>
      <GroupOwnedDiffersHint
        difference={
          group
            ? groupOwnedDifference(
                visibleMaterials.map(({ typeID }) => ({
                  typeID,
                  name: nameForType(catalog, typeID),
                })),
                plan.materialSourcing,
                group.ownedStock
              )
            : null
        }
        group={group}
      />
    </div>
  );
}
