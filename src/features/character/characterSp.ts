/**
 * The SP pair `CharacterHeader` shows on every tab of the Character overview.
 *
 * Its own module because two of those tabs — Clones and Employment History —
 * have no other reason to read /skills, and a shared header must not turn a
 * public view into one that demands a grant: with no /skills scope this skips
 * the call entirely and the chips read "—", rather than firing a guaranteed
 * 401 that would raise the shell's stale-grant notice on Employment History,
 * which needs no scope at all.
 *
 * Overview does not use this: it already loads corrected skills for its
 * training-queue panel and feeds the header from that, so it neither fetches
 * /skills twice nor loses the queue's own re-auth prompt — it calls
 * `rememberSpSummary` itself so Clones/Employment History still benefit.
 *
 * The last-known-SP cache those tabs fall back to while their own read is in
 * flight lives in `stores/characterSp.ts`, not here: it's a session-only
 * cross-view cache, the same shape as `stores/publicInfo.ts`'s corp/alliance
 * cache, so it follows that convention rather than a one-off in this module.
 */
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { NO_SP_SUMMARY, rememberSpSummary, type CharacterSpSummary } from '@/stores/characterSp';

const SKILLS_SCOPE = ESI_REGISTRY.getCharacterSkills.scope;

/** `nowMs` is a parameter, keeping the queue correction clock-free. */
export async function loadCharacterSpSummary(
  characterId: number,
  nowMs: number
): Promise<CharacterSpSummary> {
  const token = await db.tokens.get(characterId);
  // No token row means no grant at all, the same reading `useGrantedScopes`
  // takes — not a reason to attempt the call anyway.
  if (!(token?.scopes ?? []).includes(SKILLS_SCOPE)) return NO_SP_SUMMARY;

  const { skillsResult, totalSp } = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  return rememberSpSummary(characterId, {
    totalSp,
    unallocatedSp: skillsResult?.data.unallocated_sp ?? null,
  });
}
