import { cloneJumpCooldown, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/clone/cloneJump';
import { fatigueEndsAt } from '@/engine/clone/jumpTimers';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import { getCharacterFatigue, type CharacterFatigue } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCharacterClones } from '@/features/character/clones';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadGrantedScopes } from '@/app/grantedScopes';

export type JumpTimerRead = { state: 'needsPermission' } | { state: 'read'; endsAt: number | null };

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

export async function loadJumpTimersWidget(characterId: number): Promise<JumpTimersWidgetData> {
  const scopes = await loadGrantedScopes(characterId);
  const cloneGranted = scopes.has(ESI_REGISTRY.getCharacterClones.scope);
  const fatigueGranted = scopes.has(ESI_REGISTRY.getCharacterFatigue.scope);
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
