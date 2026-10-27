/**
 * The Overview's Jump timers widget reads: the clone jump cooldown (from the
 * clones read and the Infomorph Synchronizing level, via `engine/cloneJump`)
 * and jump fatigue (`esi-characters.read_fatigue.v1`, an opt-in Permission).
 *
 * Each grant is checked against the stored token before any call, so a missing
 * scope is a "needs permission" read, never a live 403 that would raise the
 * app-wide re-auth banner. Reached from the Overview through `import()`.
 */
import { cloneJumpCooldown, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/clone/cloneJump';
import { fatigueEndsAt } from '@/engine/clone/jumpTimers';
import { db } from '@/db';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import { getCharacterFatigue, type CharacterFatigue } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCharacterClones } from '@/features/character/clones';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

export type JumpTimerRead =
  | { state: 'needsPermission' }
  /** `endsAt` is when it clears, ms since the epoch; null when nothing is running. */
  | { state: 'read'; endsAt: number | null };

export interface JumpTimersWidgetData {
  clone: JumpTimerRead;
  fatigue: JumpTimerRead;
  fetchedAt: Date | null;
}

const NEEDS_PERMISSION: JumpTimerRead = { state: 'needsPermission' };

function loadCharacterFatigue(characterId: number): Promise<StatusResult<CharacterFatigue>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterFatigue(characterId, options)
  );
  return loadWithCacheStatus(characterId, 'fatigue', fetchLive, {
    conditional,
    reportFetchFailure: true,
  });
}

/** A read that found nothing and had nothing to fall back on throws, so the widget keeps its last value and offers Retry. */
export async function loadJumpTimersWidget(characterId: number): Promise<JumpTimersWidgetData> {
  const scopes = (await db.tokens.get(characterId))?.scopes ?? [];
  const cloneGranted = scopes.includes(ESI_REGISTRY.getCharacterClones.scope);
  const fatigueGranted = scopes.includes(ESI_REGISTRY.getCharacterFatigue.scope);
  const now = Date.now();
  const stamps: number[] = [];

  const readClone = async (): Promise<JumpTimerRead> => {
    if (!cloneGranted) return NEEDS_PERMISSION;
    const [{ cached, needsReauth }, level] = await Promise.all([
      loadCharacterClones(characterId),
      loadCorrectedSkills(characterId, now, { skipQueueWithoutScope: true })
        .then((skills) => skills.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0)
        .catch(() => 0),
    ]);
    if (needsReauth) return NEEDS_PERMISSION;
    if (!cached) throw new Error('Clones could not be read');
    stamps.push(cached.fetchedAt.getTime());
    const cooldown = cloneJumpCooldown(cached.data.last_clone_jump_date, level, new Date(now));
    return {
      state: 'read',
      endsAt: cooldown.onCooldown ? (cooldown.readyAt?.getTime() ?? null) : null,
    };
  };

  const readFatigue = async (): Promise<JumpTimerRead> => {
    if (!fatigueGranted) return NEEDS_PERMISSION;
    const { cached, needsReauth, fetchFailed } = await loadCharacterFatigue(characterId);
    if (needsReauth) return NEEDS_PERMISSION;
    if (!cached || fetchFailed) throw new Error('Jump fatigue could not be read');
    stamps.push(cached.fetchedAt.getTime());
    const endsAt = fatigueEndsAt(cached.data.jump_fatigue_expire_date);
    return { state: 'read', endsAt: endsAt !== null && endsAt > now ? endsAt : null };
  };

  const [clone, fatigue] = await Promise.all([readClone(), readFatigue()]);
  return {
    clone,
    fatigue,
    fetchedAt: stamps.length === 0 ? null : new Date(Math.min(...stamps)),
  };
}
