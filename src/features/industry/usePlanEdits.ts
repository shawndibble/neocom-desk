import { useEffect, useRef } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { IndustryActivity, MaterialSourcing } from '@/engine/industry/types';
import type { PlanPatch } from './planPatch';
import type { BuildPlanChange, SourcingPatchEntry } from './buildPlanStore';
import {
  facilityMemoryKey,
  forgetFacility,
  memoryFromPlan,
  patchFromMemory,
  recallFacility,
  rememberFacility,
} from './facilityMemory';
import { loadActivityFacilityDefaults, rememberActivityLocations } from './facilityDefaults';
import { rememberedLocationsFromEdit } from './rememberLocationFromEdit';

export function usePlanEdits(
  plan: BuildPlanRecord,
  activity: IndustryActivity,
  onChange: (change: BuildPlanChange) => void
) {
  const latestPlan = useRef(plan);
  const latestOnChange = useRef(onChange);
  useEffect(() => {
    latestPlan.current = plan;
    latestOnChange.current = onChange;
  });

  function editPlan(patch: PlanPatch) {
    onChange({ kind: 'edit', patch });
  }

  function update(patch: PlanPatch, { moved = false }: { moved?: boolean } = {}) {
    editPlan(patch);
    if (!moved) rememberFacilityFromEdit(patch);
    const remembered = rememberedLocationsFromEdit(plan, patch, activity);
    if (remembered.manufacturing || remembered.reaction) {
      void rememberActivityLocations(remembered);
    }
  }

  function rememberFacilityFromEdit(patch: PlanPatch) {
    const next = { ...plan, ...patch };
    if ('costIndexOverridePct' in patch && patch.costIndexOverridePct === undefined) {
      void forgetFacility(next, 'costIndexPct');
    }
    const touched =
      'rigFit' in patch ||
      'rigLevel' in patch ||
      'facilityTaxPct' in patch ||
      patch.costIndexOverridePct !== undefined;
    if (!touched) return;
    const memory = memoryFromPlan(next);
    if (Object.keys(memory).length > 0) void rememberFacility(next, memory);
  }

  function movePlan(patch: PlanPatch) {
    update({ ...patch, costIndexOverridePct: undefined }, { moved: true });
    const place = { ...plan, ...patch };
    const key = facilityMemoryKey(place);
    void recallFacility(place).then((memory) => {
      if (!memory || facilityMemoryKey(latestPlan.current) !== key) return;
      update(patchFromMemory(memory, place.facility), { moved: true });
    });
  }

  function changeSourcing(edits: readonly SourcingPatchEntry[]) {
    onChange({ kind: 'sourcing', edits });
  }

  function changeOneSourcing(typeID: number, patch: MaterialSourcing) {
    changeSourcing([{ typeID, patch }]);
  }

  function toggleBuildHere(typeID: number) {
    const current = plan.buildHere ?? [];
    update({
      buildHere: current.includes(typeID)
        ? current.filter((id) => id !== typeID)
        : [...current, typeID],
    });
  }

  function buildHereAll(typeIDs: readonly number[]) {
    const current = plan.buildHere ?? [];
    const added = typeIDs.filter((id) => !current.includes(id));
    if (added.length > 0) update({ buildHere: [...current, ...added] });
  }

  function toggleIncludeReactions(next: boolean) {
    if (next && plan.reactionFacility === undefined) {
      void loadActivityFacilityDefaults().then(({ reaction: seed }) =>
        editPlan({
          includeReactions: true,
          reactionFacility: seed.facility,
          reactionRigFit: seed.rigFit,
          reactionFacilityTaxPct: seed.facilityTaxPct ?? undefined,
          ...(seed.security !== undefined ? { reactionSecurity: seed.security } : {}),
          ...(seed.buildSystemId !== undefined && seed.buildSystemName !== undefined
            ? {
                reactionBuildSystemId: seed.buildSystemId,
                reactionBuildSystemName: seed.buildSystemName,
              }
            : {}),
          ...(seed.buildLocationId !== undefined
            ? { reactionBuildLocationId: seed.buildLocationId }
            : {}),
          ...(seed.buildLocationName !== undefined
            ? { reactionBuildLocationName: seed.buildLocationName }
            : {}),
        })
      );
    } else {
      editPlan({ includeReactions: next });
    }
  }

  return {
    latestPlan,
    latestOnChange,
    editPlan,
    update,
    movePlan,
    changeSourcing,
    changeOneSourcing,
    toggleBuildHere,
    buildHereAll,
    toggleIncludeReactions,
  };
}
