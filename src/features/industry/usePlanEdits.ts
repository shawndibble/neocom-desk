/**
 * Every write the Build Plan page makes to its own plan, as handlers: plain
 * edits, location moves (which remember the place and recall what the pilot
 * told the app about it), sourcing edits and the craft/buy and Include
 * Reactions toggles. The write itself is `onChange` — `buildPlanStore.ts` owns
 * the Dexie transaction and the sync.
 *
 * Also returns the refs the page's facility-recall effect reads, so that
 * effect and these handlers see the same latest plan.
 */
import { useEffect, useRef } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { IndustryActivity, MaterialSourcing } from '@/engine/industry/types';
import type { PlanPatch } from './BuildPlanDetail';
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

  /** A plan edit that is not the pilot choosing a place — see {@link update}. */
  function editPlan(patch: PlanPatch) {
    onChange({ kind: 'edit', patch });
  }

  /**
   * Every control's edit. One that moves the plan's location — or its
   * Reaction Location — also remembers the result as where the pilot's next
   * plan of that activity starts. Edits that touch no location fields
   * remember nothing, so this is safe for every control on the page.
   */
  function update(patch: PlanPatch, { moved = false }: { moved?: boolean } = {}) {
    editPlan(patch);
    if (!moved) rememberFacilityFromEdit(patch);
    const remembered = rememberedLocationsFromEdit(plan, patch, activity);
    if (remembered.manufacturing || remembered.reaction) {
      void rememberActivityLocations(remembered);
    }
  }

  /**
   * Saves what the pilot just set for this facility — rigs, tax and the cost
   * index they typed (the field only exists where ESI has none) — so any other
   * plan built there starts with it
   * (`facilityMemory.ts`). A cleared index is forgotten, so a deliberate clear
   * is not undone by the recall on the next visit.
   */
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

  /**
   * Moves the plan to another place, then fills in what the pilot already told
   * the app about it. The override is tied to the system it was read for, so it
   * is dropped first; the recall may bring one back for the new place. Skips
   * `rememberFacilityFromEdit`: the plan still carries the old place's rigs for
   * a moment, and filing those under the new one would poison it.
   */
  function movePlan(patch: PlanPatch) {
    update({ ...patch, costIndexOverridePct: undefined }, { moved: true });
    const place = { ...plan, ...patch };
    const key = facilityMemoryKey(place);
    void recallFacility(place).then((memory) => {
      // The pilot moved again while this was read: the answer is for a place
      // they have already left.
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

  /**
   * Switches one material between being bought and being produced here.
   *
   * The whole list is rewritten rather than the single entry toggled in place,
   * because it is a plain field on the record — unlike `materialSourcing`,
   * which is a nested map and so needs the read-modify-write path a
   * `sourcing` change takes.
   */
  function toggleBuildHere(typeID: number) {
    const current = plan.buildHere ?? [];
    update({
      buildHere: current.includes(typeID)
        ? current.filter((id) => id !== typeID)
        : [...current, typeID],
    });
  }

  /**
   * Include Reactions (issue #698). Turning it on for the first time — no
   * Reaction Location configured yet — pre-fills the whole Reaction Location
   * from the remembered reaction default (`reactionFacilityDefaults.ts`), the
   * place the pilot last set reactions to run. Turning it off only clears the
   * flag: the Reaction Location itself is left alone, so flipping it back on
   * doesn't lose whatever the pilot configured.
   *
   * Through `editPlan`, not `update`: the pre-fill *is* the remembered
   * default, so writing it back would only re-stamp it as a fresh choice.
   * Awaits hydration, so a click that lands before the stored record has
   * loaded still pre-fills the remembered place, not the built-in default.
   */
  function toggleIncludeReactions(next: boolean) {
    if (next && plan.reactionFacility === undefined) {
      void loadActivityFacilityDefaults().then(({ reaction: seed }) =>
        editPlan({
          includeReactions: true,
          reactionFacility: seed.facility,
          reactionRigFit: seed.rigFit,
          reactionFacilityTaxPct: seed.facilityTaxPct ?? undefined,
          // Only what the record holds: an absent band already reads as
          // highsec, and an absent system as the hub's.
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
    toggleIncludeReactions,
  };
}
