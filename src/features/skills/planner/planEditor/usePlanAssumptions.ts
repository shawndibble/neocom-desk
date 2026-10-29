import { useMemo } from 'react';
import type { PlanBooster, SkillPlanRecord, WhatIfImplantSelection } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { CloneState, Implants } from '@/engine/types';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cloneStateFor, useCloneStates, withCloneState } from '../../cloneState';
import { useJumpCloneImplantSets } from '../jumpCloneImplants';
import { resolvePlanBoosters, toBoosters } from '../planBooster';
import {
  matchingCloneId,
  normalizeWhatIfSelection,
  readsLoadedImplants,
  whatIfImplants,
} from '../whatIfImplants';
import type { PlanEditorProps } from './types';

/**
 * The lenses every number on the page is costed under: Clone State, What-If Implants and
 * Boosters, with the effective implants and active boosters they resolve to.
 */
export function usePlanAssumptions({
  characterId,
  plan,
  implants,
  attributeBaseline,
  onUpdate,
}: {
  characterId: number;
  plan: SkillPlanRecord;
  implants: Implants;
  attributeBaseline: AttributeBaseline | null;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  // Clone State (GLOSSARY.md): per Character, not per plan. The control waits
  // for hydration — a write from the empty default would replace the whole
  // blob and drop every other Character's answer.
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useHydratedStore(useCloneStates);
  const setCloneStates = useCloneStates((state) => state.setValue);
  const cloneState = cloneStateFor(cloneStates, characterId);
  const setCloneState = (next: CloneState): void =>
    void setCloneStates(withCloneState(cloneStates, characterId, next));

  // What-If Implants (GLOSSARY.md): swap the clone's real implants for a
  // hypothetical set — a uniform preset, or five per-slot bonuses, since EVE's
  // hardwirings are per attribute. Saved on the plan and synced with it, not
  // held for the session: it is one of the two lenses every number on this
  // page is costed under, so a plan that reopened on a different lens reopened
  // quoting different training times than the ones the user left it showing.
  // Device-local view preferences (Columns, Group-by above) are the opposite
  // case — they change what is *shown*, not what is *computed*.
  //
  // Normalized on read rather than trusted: the value can arrive from another
  // device or an older build (whatIfImplants.ts).
  const whatIf = useMemo(
    () => normalizeWhatIfSelection(plan.whatIfImplants),
    [plan.whatIfImplants]
  );
  const setWhatIf = (selection: WhatIfImplantSelection): void => {
    void onUpdate({ whatIfImplants: selection });
  };
  const jumpClones = useJumpCloneImplantSets(characterId);
  const matchedCloneId = matchingCloneId(whatIf, implants, jumpClones);
  const effectiveImplants = useMemo(() => whatIfImplants(whatIf, implants), [whatIf, implants]);

  // Training time assumes no implants only when it is actually reading the
  // (possibly empty) loaded set — an explicit "no implants" or custom What-If
  // choice is the pilot's own call, not a permission gap (issue #1526).
  const implantsAssumed = readsLoadedImplants(whatIf);

  // An in-game cerebral accelerator is baked into the attributes ESI reports
  // and cannot be read back out of any endpoint, so `attributeBaseline`
  // recovers it arithmetically and it is modelled here, through the same
  // Booster the What-If control drives — one mechanism, applied once. Prefill
  // is the point: the alternative is correcting the baseline silently, which
  // leaves the user's plan slower with nothing on screen saying why.
  const detectedAccelerator =
    attributeBaseline?.kind === 'accelerated' ? attributeBaseline.acceleratorBonus : null;

  // Boosters (GLOSSARY.md): an ordered list of cerebral accelerators, each a
  // uniform bonus to every attribute from an optional start until its
  // expiry — EVE has one booster slot, so at most one is ever live. Saved on
  // the plan for the same reason as the lens above.
  //
  // A pure derivation, not seeded state — the prefill rule and its "neither
  // field stored is what 'unanswered' means" gate live in planBooster.ts,
  // where they are unit-tested; the moment the user touches any control the
  // whole answer is written back through `onChange` below. Field-level
  // editing state (draft text, the blur-commit rule, quick picks) lives in
  // `BoosterList` itself, which owns rendering this control.
  const planBoosters = useMemo<PlanBooster[]>(
    () => resolvePlanBoosters(plan.boosters, plan.booster, detectedAccelerator),
    [plan.boosters, plan.booster, detectedAccelerator]
  );
  const activeBoosters = useMemo(() => toBoosters(planBoosters), [planBoosters]);

  return {
    cloneState,
    cloneStatesHydrated,
    setCloneState,
    whatIf,
    setWhatIf,
    jumpClones,
    matchedCloneId,
    effectiveImplants,
    implantsAssumed,
    detectedAccelerator,
    planBoosters,
    activeBoosters,
  };
}
