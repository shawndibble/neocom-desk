import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PlanBooster, type SkillPlanRecord, type WhatIfImplantSelection } from '@/db';
import { isAcceleratorLive } from '@/engine/accelerator';
import {
  acceleratorId,
  clearCharacterAccelerator,
  setCharacterAccelerator,
} from '@/features/accelerator/characterAccelerators';
import { useNow } from '@/lib/useNow';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { CloneState, Implants } from '@/engine/types';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cloneStateFor, useCloneStates, withCloneState } from '../../cloneState';
import { useJumpCloneImplantSets } from '../jumpCloneImplants';
import { composePlanBoosters, splitPlanBoosters, toBoosters } from '../planBooster';
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
  // Device-local view preferences (Columns, Group-by: `usePlanViewPrefs`) are the opposite
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
  // whole answer is written back through `onChange` in `AssumptionControls`. Field-level
  // editing state (draft text, the blur-commit rule, quick picks) lives in
  // `BoosterList` itself, which owns rendering this control.
  //
  // The first row is the Character's own accelerator (`features/accelerator`),
  // shared with the Characters table: editing its time here edits it there, and
  // the plan keeps only the rows it queues behind it.
  const storedAccelerator = useLiveQuery(
    () => db.characterAccelerators.get(acceleratorId(characterId)),
    [characterId]
  );
  const now = useNow();
  const runningAccelerator =
    storedAccelerator && isAcceleratorLive(storedAccelerator, now) ? storedAccelerator : null;
  const planBoosters = useMemo<PlanBooster[]>(
    () => composePlanBoosters(plan.boosters, plan.booster, runningAccelerator, detectedAccelerator),
    [plan.boosters, plan.booster, runningAccelerator, detectedAccelerator]
  );
  const activeBoosters = useMemo(() => toBoosters(planBoosters), [planBoosters]);
  const setPlanBoosters = (next: PlanBooster[]): void => {
    const { accelerator, planRows } = splitPlanBoosters(next);
    if (accelerator) {
      void setCharacterAccelerator(characterId, accelerator.bonus, accelerator.expiresAt);
      // A plan that has never answered stays unanswered: writing `[]` would
      // read as "no accelerators" and keep detection from prefilling it.
      const answered = plan.boosters !== undefined || plan.booster !== undefined;
      if (answered || planRows.length > 0) void onUpdate({ boosters: planRows });
      return;
    }
    if (runningAccelerator) void clearCharacterAccelerator(characterId);
    void onUpdate({ boosters: planRows });
  };

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
    runningAccelerator,
    setPlanBoosters,
    activeBoosters,
  };
}
