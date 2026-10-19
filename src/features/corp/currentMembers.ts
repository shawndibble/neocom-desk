/**
 * Who is in the corporation right now, for the Corp Tax Book's "left corp, owes
 * X" flag (issue #4194). The Director-only roster is not needed: the public
 * `POST /characters/affiliation` (batched and cached by `resolveAffiliations`)
 * answers for any character, so an Accountant sees leavers too.
 */
import { resolveAffiliations } from '@/features/character/affiliations';

/**
 * The characters of `characterIds` that are in the corporation now. A
 * character ESI gave no answer for stays in the set: not hearing is not
 * hearing that it left, and a false "left corp" flag is worse than none.
 * Undefined when no one could be resolved, so standing falls back to the
 * ledger.
 */
export async function loadCurrentMemberIds(
  characterIds: readonly number[],
  corporationId: number
): Promise<ReadonlySet<number> | undefined> {
  const ids = [...new Set(characterIds)];
  if (ids.length === 0) return undefined;
  const answers = await resolveAffiliations(ids);
  if (answers.size === 0) return undefined;
  return new Set(
    ids.filter((id) =>
      answers.get(id)?.corporation_id !== undefined
        ? answers.get(id)!.corporation_id === corporationId
        : true
    )
  );
}
