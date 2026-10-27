import { loadCharacterClones } from '@/features/character/clones';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { cloneJumpCooldownHours, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/clone/cloneJump';
import { projectCloneJump } from '@/engine/projection';
import type {
  CloneJumpEntrySnapshot,
  CloneJumpReadyFire,
  CloneJumpSnapshot,
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS } from './shared';

/* Clone jump (issue #2316) --------------------------------------------------- */

const isCloneJumpEntrySnapshot = shapeGuard<CloneJumpEntrySnapshot>({
  lastJumpMs: is.number,
  readyAtMs: is.number,
});

/**
 * The effective Infomorph Synchronizing level, exactly as the Clones route
 * reads it (#1236). Unreadable skills fall back to level 0 — the longest
 * cooldown — so the alert can arrive late, never early.
 */
async function infomorphSynchronizingLevel(characterId: number, nowMs: number): Promise<number> {
  try {
    const corrected = await loadCorrectedSkills(characterId, nowMs, {
      skipQueueWithoutScope: true,
    });
    return corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0;
  } catch {
    return 0;
  }
}

export const cloneJumpDomain = defineDomain<
  CloneJumpEntrySnapshot,
  CloneJumpSnapshot,
  CloneJumpReadyFire
>({
  source: SNAPSHOT_SOURCES.cloneJump,
  stateKey: 'notifications.pollerState.cloneJump',
  entriesKey: 'entries',
  isEntry: isCloneJumpEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterClones(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const last = result.cached.data.last_clone_jump_date;
    const lastJumpMs = last ? Date.parse(last) : NaN;
    // Never jumped: no cooldown to end, so no entry — and no skills fetch.
    if (!Number.isFinite(lastJumpMs)) return [];
    const level = await infomorphSynchronizingLevel(characterId, Date.now());
    return [{ lastJumpMs, readyAtMs: lastJumpMs + cloneJumpCooldownHours(level) * HOUR_MS }];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) =>
    projectCloneJump(
      characterId,
      characterName,
      snapshot.entries,
      NOTIFICATION_EVENT_ENTRIES.cloneJumpReady.projection.push,
      nowMs
    ),
});
