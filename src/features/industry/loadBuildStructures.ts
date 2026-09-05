/**
 * Fetches the corp structures a Build Plan can be pointed at.
 *
 * Two reads, and only one of them is corp-gated: the structure list itself,
 * and then `/universe/systems/{id}` for each distinct system it names — public,
 * cached as a map constant (`STALE_AFTER.static`), and shared with the Assets
 * security badge, so a corp with six structures in three systems costs three
 * lookups the first time and none after.
 *
 * Called only when the pilot opens the picker, never on panel mount: the corp
 * endpoint is role-gated and rate-limited, and `useCorpSnapshot` exists to keep
 * that opt-in.
 */
import { loadCorporationStructures } from '@/features/corp/boardData';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import {
  buildStructureOptions,
  type BuildStructureOption,
  type SystemSummary,
} from './buildStructures';

export async function loadBuildStructureOptions(
  characterId: number,
  corporationId: number
): Promise<BuildStructureOption[]> {
  const structures = (await loadCorporationStructures(characterId, corporationId)).cached?.data;
  if (!structures || structures.length === 0) return [];

  const systemIds = [...new Set(structures.map((s) => s.system_id))];
  const summaries = await Promise.all(
    systemIds.map(async (id): Promise<[number, SystemSummary] | null> => {
      // One cached `/universe/systems/{id}` row answers both.
      const [name, security] = await Promise.all([loadSystemName(id), loadSystemSecurity(id)]);
      return name === null || security === null ? null : [id, { name, security }];
    })
  );

  return buildStructureOptions(structures, new Map(summaries.filter((entry) => entry !== null)));
}
