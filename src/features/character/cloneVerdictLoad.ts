import { cloneJumpCooldown, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/clone/cloneJump';
import { loadCharacterClones } from '@/features/character/clones';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadCharacterImplantsWithStatus } from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import type { JumpClone } from '@/esi/endpoints';
import { loadCloneTrainingData, WORN_CLONE_ID } from './cloneTraining';
import { cloneVerdictGate, runCloneVerdict, type CloneVerdictNote } from './cloneVerdictGate';
import { cloneOwnName, readCloneNicknames } from './cloneNicknames';

export interface CloneWidgetRow {
  id: string | number;
  label: string | null;
  location?: string | null;
  implantCount?: number | null;
  totalSeconds: number | null;
  deltaSeconds: number | null;
}

export interface ClonesWidgetData {
  needsReauth: boolean;
  note: CloneVerdictNote | null;
  cloneCount: number;
  verdict: 'stay' | 'jump' | null;
  bestId: string | number | null;
  savedSeconds: number | null;
  cooldownReadyAt: number | null;
  rows: CloneWidgetRow[];
  fetchedAt: Date | null;
}

async function placeOf(characterId: number, clone: JumpClone): Promise<string | null> {
  try {
    return clone.location_type === 'station'
      ? await loadStationName(clone.location_id)
      : await loadStructureName(characterId, clone.location_id);
  } catch {
    return null;
  }
}

export async function loadCloneVerdictWidget(characterId: number): Promise<ClonesWidgetData> {
  const [{ cached: clonesResult, needsReauth }, corrected, { cached: worn }] = await Promise.all([
    loadCharacterClones(characterId),
    loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }),
    loadCharacterImplantsWithStatus(characterId),
  ]);
  const loadedAt = Date.now();
  const clones = clonesResult?.data.jump_clones ?? [];
  const cooldown = cloneJumpCooldown(
    clonesResult?.data.last_clone_jump_date ?? null,
    corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0,
    new Date(loadedAt)
  );
  const readyAt = cooldown.onCooldown ? cooldown.readyAt : null;
  const training =
    corrected.queueResult && worn
      ? await loadCloneTrainingData(characterId, loadedAt, {
          jumpClones: clones,
          wornImplantIds: worn.data,
          queue: corrected.queueResult.data,
        }).catch(() => null)
      : null;
  await useCloneStates.getState().hydrate();
  const result = runCloneVerdict(
    training,
    cloneStateFor(useCloneStates.getState().value, characterId),
    loadedAt,
    readyAt
  );
  const gate = cloneVerdictGate(
    {
      wornImplantsRead: worn !== null,
      queue: corrected.queueResult?.data ?? null,
      training,
    },
    result
  );
  const [places, nicknames] = await Promise.all([
    Promise.all(clones.map((clone) => placeOf(characterId, clone))),
    readCloneNicknames(),
  ]);
  const cloneById = new Map<string | number, { clone: JumpClone; place: string | null }>(
    clones.map((clone, i) => [clone.jump_clone_id, { clone, place: places[i] ?? null }])
  );
  const ready = gate?.kind === 'verdict' ? gate.result : null;
  return {
    needsReauth,
    note: gate?.kind === 'note' ? gate.note : null,
    cloneCount: clones.length,
    verdict: ready?.verdict.kind ?? null,
    bestId: ready?.bestCloneId ?? null,
    savedSeconds: ready?.verdict.kind === 'jump' ? ready.verdict.savedSeconds : null,
    cooldownReadyAt: readyAt?.getTime() ?? null,
    rows: (ready?.rows ?? []).map((row) => {
      const jump = cloneById.get(row.cloneId);
      const own = jump ? cloneOwnName(jump.clone, nicknames) : undefined;
      return {
        id: row.cloneId,
        label: row.cloneId === WORN_CLONE_ID ? null : own || (jump?.place ?? null),
        location: row.cloneId === WORN_CLONE_ID ? null : (jump?.place ?? null),
        implantCount:
          row.cloneId === WORN_CLONE_ID
            ? (worn?.data.length ?? null)
            : (jump?.clone.implants.length ?? null),
        totalSeconds: row.totalSeconds,
        deltaSeconds: row.deltaSeconds,
      };
    }),
    fetchedAt: clonesResult?.fetchedAt ?? null,
  };
}
