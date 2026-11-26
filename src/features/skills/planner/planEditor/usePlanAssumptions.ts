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
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useHydratedStore(useCloneStates);
  const setCloneStates = useCloneStates((state) => state.setValue);
  const cloneState = cloneStateFor(cloneStates, characterId);
  const setCloneState = (next: CloneState): void =>
    void setCloneStates(withCloneState(cloneStates, characterId, next));

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

  const implantsAssumed = readsLoadedImplants(whatIf);

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
