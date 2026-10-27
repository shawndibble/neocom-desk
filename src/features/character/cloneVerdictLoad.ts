/**
 * The Overview's Best clone widget reads: which jump clone finishes the queue
 * soonest, and by how much. The same loads the Clones page's verdict card
 * makes (clones, corrected skills, worn implants, attribute sheet), composed
 * once here, with the precedence and the comparison shared through
 * `cloneVerdictGate` so the widget and the page cannot disagree.
 *
 * Heavy (dogma lookups for implants, the SDE skill catalogue), so the
 * Overview reaches it only through `import()`.
 */
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
  /** `WORN_CLONE_ID` for the clone being worn. */
  id: string | number;
  /** The pilot's own name for it, else its resolved location; null when neither is known (the widget says "Clone #id"). */
  label: string | null;
  /** Where the clone sits (station or structure name), when it resolved; null for the worn clone and for an unknown place. */
  location?: string | null;
  /** Implants plugged into it; for the worn clone, the implants worn right now. Null when not read. */
  implantCount?: number | null;
  /** Queue time wearing it, jumping when allowed; null for a paused queue. */
  totalSeconds: number | null;
  /** Against the worn clone; negative is sooner. */
  deltaSeconds: number | null;
}

export interface ClonesWidgetData {
  /** The clones grant lapsed. */
  needsReauth: boolean;
  /** Why there is no verdict; null when there is one. */
  note: CloneVerdictNote | null;
  /** Jump clones the Character holds (the worn one is not counted). */
  cloneCount: number;
  verdict: 'stay' | 'jump' | null;
  bestId: string | number | null;
  /** Seconds a jump saves; only for a `jump` verdict. */
  savedSeconds: number | null;
  /** When the clone jump cooldown ends, if it is running. */
  cooldownReadyAt: number | null;
  rows: CloneWidgetRow[];
  fetchedAt: Date | null;
}

/** Where a jump clone sits, by name; null when the lookup fails (offline, no ACL). */
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
