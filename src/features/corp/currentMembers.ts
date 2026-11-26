import { resolveAffiliations } from '@/features/character/affiliations';

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
