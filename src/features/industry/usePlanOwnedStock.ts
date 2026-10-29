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

/** A plan's Build Group as the owned-total-differs hint reads it: name, id and owned-stock ledger. */
export type PlanGroup = Pick<BuildGroup, 'id' | 'name'> & { ownedStock?: Record<number, number> };

/**
 * Everything the Materials panel knows about what the pilot already owns:
 * the detected stock, its scoped view, sibling plans' claims on it, and the
 * account-wide skill gates for the rows that build.
 */
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

  // Every material on the table, not just the blueprint's own: a mineral a
  // sub-build introduced is as ownable as anything else, and while this was
  // the blueprint's material list a player with 10,714,573 Tritanium in the
  // hangar was told they owned none of it the moment the Tritanium row came
  // from a component's recipe rather than the ship's. Content-keyed, not
  // array-keyed — see `materialTypeIdKey` for why that matters.
  const materialTypeIdsKey = useMemo(() => materialTypeIdKey(visibleMaterials), [visibleMaterials]);
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);
  // Folded in only when this plan's own toggle is on — Corp Assets is a
  // per-plan choice (issue #798), not something every plan inherits merely
  // because the active Character happens to hold Director on some corp.
  const includeCorpAssets = (plan.includeCorpAssets ?? false) && corpOwnedStock.available;
  const {
    stock: detectedStock,
    characterNames,
    locationNames,
    incompleteCharacters,
  } = useDetectedOwnedStock(
    ownedStockSnapshot,
    materialTypeIds,
    includeCorpAssets ? corpOwnedStock.source : null
  );

  // Skill-gate marker for a sub-build row: account-wide, not this plan's own
  // `skills` prop — same precedent Active Jobs' slot header and
  // `MarketWideOpportunitiesPanel` both follow.
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

  // The plan's own top-level product (issue #1231) — the header this same
  // account-wide check used to explicitly skip (see the 2026-09-14 decision
  // this reverses for the top-level case).
  // The header counts only the materials set to build, never one the pilot
  // buys. The product's own blueprint is not in it: a plan that buys every
  // material shows nothing here.
  const topLevelSkillGate = useMemo(
    () =>
      mergeSkillGates(
        visibleMaterials
          .filter((material) => material.subBuilds.length > 0)
          .map((material) => skillGates.get(material.typeID))
      ),
    [visibleMaterials, skillGates]
  );

  // `detection.scopedQuantityFor` is narrowed to the plan's owned-stock scope
  // (issue #454); `detectedStock` stays the galaxy-wide picture.
  const { detection } = useMemo(
    () =>
      ownedStockView(
        {
          stock: detectedStock,
          scope: plan.ownedStockScope,
          characterNames,
          locationNames,
          incompleteCharacters,
          // The corp source's own incompleteness (a capped/missing asset
          // page) folds in only while it's actually contributing — an
          // untoggled or unavailable corp source has nothing to be
          // incomplete about.
          incompleteCorporation:
            includeCorpAssets && corpOwnedStock.incomplete ? corpOwnedStock.corporationName : null,
          corporationName: corpOwnedStock.corporationName,
        },
        t
      ),
    [
      detectedStock,
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

  // Sibling members' Haves, against the same stock this plan's offer reads.
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
