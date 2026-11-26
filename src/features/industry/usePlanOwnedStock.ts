import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildPlanRecord } from '@/db';
import { groupStockClaims, type GroupClaimMember } from '@/engine/industry/groupStockClaims';
import {
  evaluateSkillGate,
  mergeSkillGates,
  type SkillGateVerdict,
} from '@/engine/industry/skillGate';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { MaterialTableRow } from './subBuildPlan';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { materialTypeIdKey, ownedStockView, typeIdsFromKey } from './planMaterialsView';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';

export type PlanGroup = Pick<BuildGroup, 'id' | 'name'> & { ownedStock?: Record<number, number> };

export function usePlanOwnedStock(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  visibleMaterials: readonly MaterialTableRow[],
  ownedStockSnapshot: OwnedStockSnapshot,
  corpOwnedStock: CorpOwnedStockState,
  group: PlanGroup | null,
  groupMembers: readonly GroupClaimMember[]
) {
  const { t } = useTranslation();

  const materialTypeIdsKey = useMemo(() => materialTypeIdKey(visibleMaterials), [visibleMaterials]);
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);
  const includeCorpAssets = (plan.includeCorpAssets ?? false) && corpOwnedStock.available;
  const {
    stock: detectedStock,
    stockBeforeJobs,
    reductions,
    characterNames,
    locationNames,
    incompleteCharacters,
  } = useDetectedOwnedStock(
    ownedStockSnapshot,
    materialTypeIds,
    includeCorpAssets ? corpOwnedStock.source : null
  );

  const skillGateCharacterIds = [...characterNames.keys()];
  const accountSkills = useAccountSkillLevels(skillGateCharacterIds);
  const skillGates = useMemo(() => {
    const gates = new Map<number, SkillGateVerdict>();
    for (const material of visibleMaterials) {
      const requirements = catalog.byProductTypeID.get(material.typeID)?.blueprint.skills ?? [];
      gates.set(material.typeID, evaluateSkillGate(requirements, accountSkills));
    }
    return gates;
  }, [visibleMaterials, catalog, accountSkills]);

  const topLevelSkillGate = useMemo(
    () =>
      mergeSkillGates(
        visibleMaterials
          .filter((material) => material.subBuilds.length > 0)
          .map((material) => skillGates.get(material.typeID))
      ),
    [visibleMaterials, skillGates]
  );

  const { detection } = useMemo(
    () =>
      ownedStockView(
        {
          stock: detectedStock,
          stockBeforeJobs,
          reductions,
          scope: plan.ownedStockScope,
          characterNames,
          locationNames,
          incompleteCharacters,
          incompleteCorporation:
            includeCorpAssets && corpOwnedStock.incomplete ? corpOwnedStock.corporationName : null,
          corporationName: corpOwnedStock.corporationName,
        },
        t
      ),
    [
      detectedStock,
      stockBeforeJobs,
      reductions,
      plan.ownedStockScope,
      characterNames,
      locationNames,
      incompleteCharacters,
      includeCorpAssets,
      corpOwnedStock.incomplete,
      corpOwnedStock.corporationName,
      t,
    ]
  );

  const groupClaimsFor = useMemo(
    () =>
      group !== null && groupMembers.length > 1
        ? groupStockClaims(plan, groupMembers, detectedStock)
        : undefined,
    [group, plan, groupMembers, detectedStock]
  );

  return {
    detectedStock,
    accountSkills,
    skillGates,
    topLevelSkillGate,
    detection,
    groupClaimsFor,
    characterNames,
  };
}
