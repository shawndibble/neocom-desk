/**
 * The Calendar's one corporation read: the moon drills the corp ops board
 * already shows, as a clock kind of the Character's own.
 *
 * **Gated before it fetches, not after.** CCP role-gates the extraction
 * endpoint server-side, so a Character without `Station_Manager` would get a
 * 403 for asking. This loader therefore checks the way `pollDomains`'
 * `corpContextFor` does — corporation, then roles, then scopes — and makes no
 * corp read at all unless every step passes. `undefined` means "not readable",
 * which the engine reads as a kind that contributes nothing (a Character who
 * cannot read a source is never shown a zero for it), so a pilot with no corp
 * role sees exactly the Calendar they had before.
 *
 * The roles read is itself scope-gated: `esi-characters.read_corporation_roles.v1`
 * is not part of every grant, and asking without it raises the app-wide re-auth
 * notice over a page that never needed corp data.
 */
import { db } from '@/db';
import { corpCapabilities } from '@/engine/corpRoles';
import type { CorporationStructure } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  loadCorporationId,
  loadCorporationMiningExtractions,
  loadCorporationStructures,
} from '@/features/corp/boardData';
import { structureName, toBoardExtractions } from '@/features/corp/boardSources';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { corpWideRoles, loadCharacterRoles } from '@/features/corp/roles';
import type { BoardClockSource } from '@/engine/character/board';
import { toMoonChunkSources } from './calendarBoardSources';

export interface MoonChunkRead {
  /** The extraction read, for the view's Data Age and offline marker. */
  result: StatusResult<unknown[]>;
  /** `undefined` when the Character may not read extractions, so the kind is not readable. */
  sources: BoardClockSource[] | undefined;
}

const NOT_READABLE: MoonChunkRead = {
  result: { cached: null, needsReauth: false },
  sources: undefined,
};

export async function loadMoonChunks(characterId: number, nowMs: number): Promise<MoonChunkRead> {
  const granted = new Set((await db.tokens.get(characterId))?.scopes ?? []);
  if (!granted.has(ESI_REGISTRY.getCharacterRoles.scope)) return NOT_READABLE;

  const holdsScopesFor = (capability: 'canReadMoonExtractions' | 'canReadStructures') =>
    CORP_SCOPES_FOR_CAPABILITY[capability].every((scope) => granted.has(scope));

  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return NOT_READABLE;
  const roles = await loadCharacterRoles(characterId);
  if (roles.needsReauth || roles.cached === null) return NOT_READABLE;

  const capabilities = corpCapabilities(corpWideRoles(roles.cached.data));
  if (!capabilities.canReadMoonExtractions) return NOT_READABLE;
  if (!holdsScopesFor('canReadMoonExtractions')) return NOT_READABLE;

  const canNameRefineries = capabilities.canReadStructures && holdsScopesFor('canReadStructures');
  const [extractions, structures] = await Promise.all([
    loadCorporationMiningExtractions(characterId, corporationId),
    canNameRefineries ? loadCorporationStructures(characterId, corporationId) : undefined,
  ]);
  if (extractions.cached === null) return { result: extractions, sources: undefined };

  const names = new Map<number, string>(
    (structures?.cached?.data ?? []).map((structure: CorporationStructure) => [
      structure.structure_id,
      structureName(structure),
    ])
  );
  return {
    result: extractions,
    sources: toMoonChunkSources(toBoardExtractions(extractions.cached.data, names), nowMs),
  };
}
