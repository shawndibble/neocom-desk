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
 * /skills twice nor loses the queue's own re-auth prompt.
 */
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

const SKILLS_SCOPE = ESI_REGISTRY.getCharacterSkills.scope;

export interface CharacterSpSummary {
  /** total_sp corrected for queue levels /skills has not caught up to; null when unavailable. */
  totalSp: number | null;
  /** ESI's unallocated_sp; null when unavailable — not granted, not fetched, or absent from the payload. */
  unallocatedSp: number | null;
}

/** Stable identity for "nothing to show", so a caller can default to it without allocating. */
export const NO_SP_SUMMARY: CharacterSpSummary = { totalSp: null, unallocatedSp: null };

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
  return { totalSp, unallocatedSp: skillsResult?.data.unallocated_sp ?? null };
}
