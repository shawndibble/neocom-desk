import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord, type WhatIfImplantSelection } from '@/db';
import { acceleratorId, injectedAccelerator } from '@/features/accelerator/characterAccelerators';
import { useNow } from '@/lib/useNow';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { CloneState, Implants } from '@/engine/types';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cloneStateFor, useCloneStates, withCloneState } from '../../cloneState';
import { useJumpCloneImplantSets } from '../jumpCloneImplants';
import { acceleratorBoosters } from '../planBooster';
import {
  matchingCloneId,
  normalizeWhatIfSelection,
  readsLoadedImplants,
  whatIfImplants,
} from '../whatIfImplants';
import type { PlanEditorProps } from './types';

/**
 * The lenses every number on the page is costed under: Clone State, What-If Implants and
 * the Accelerator, with the effective implants and active boosters they resolve to.
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

  // The Character's Accelerator (GLOSSARY.md): one per Character, shared with
  // the Characters table, never saved on the plan. A typed-in one that is still
  // running costs the plan; one only detected from the attribute sheet has a
  // size but no known expiry, so it is shown and costs nothing until the pilot
  // says when it runs out (`acceleratorBoosters`).
  const storedAccelerator = useLiveQuery(
    () => db.characterAccelerators.get(acceleratorId(characterId)),
    [characterId]
  );
  const now = useNow();
  const { running: runningAccelerator, detected: detectedAccelerator } = injectedAccelerator(
    storedAccelerator,
    attributeBaseline,
    now
  );
  const activeBoosters = useMemo(
    () => acceleratorBoosters(runningAccelerator),
    [runningAccelerator]
  );

  return {
    characterId,
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
    runningAccelerator,
    activeBoosters,
  };
}
