import { corpCapabilities, type CorpCapabilities } from '@/engine/corpRoles';
import { isNpcCorporationId } from '@/esi/entityIds';
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { loadCorporationId } from './boardData';
import { CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { corpWideRoles, loadCharacterRoles } from './roles';
import { loadGrantedScopes } from '@/app/grantedScopes';

export type CorpCapability = keyof CorpCapabilities;

export interface CorpReadAccess {
  corporationId: number;
  can: (capability: CorpCapability) => boolean;
}

export async function resolveCorpReadAccess(characterId: number): Promise<CorpReadAccess | null> {
  const granted = await loadGrantedScopes(characterId);
  if (!granted.has(ESI_REGISTRY.getCharacterRoles.scope)) return null;
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return null;
  const roles = await loadCharacterRoles(characterId);
  if (roles.needsReauth || roles.cached === null) return null;
  const capabilities = corpCapabilities(corpWideRoles(roles.cached.data));
  return {
    corporationId,
    can: (capability) =>
      capabilities[capability] &&
      CORP_SCOPES_FOR_CAPABILITY[capability].every((scope) => granted.has(scope)),
  };
}

export interface AccountCorpAccess {
  characterId: number;
  access: CorpReadAccess;
}

export async function loadAccountCorpAccess(): Promise<AccountCorpAccess[]> {
  const { entries } = await fanOutAllCharacters({
    load: async ({ characterId }) => {
      const access = await resolveCorpReadAccess(characterId);
      return access === null ? null : { characterId, access };
    },
  });
  return entries;
}

export function corpReadersFor(
  accounts: readonly AccountCorpAccess[],
  capability: CorpCapability | null,
  preferredCharacterId?: number
): Map<number, number> {
  const readers = new Map<number, number>();
  for (const { characterId, access } of accounts) {
    if (capability === null ? isNpcCorporationId(access.corporationId) : !access.can(capability)) {
      continue;
    }
    if (!readers.has(access.corporationId) || characterId === preferredCharacterId) {
      readers.set(access.corporationId, characterId);
    }
  }
  return readers;
}

export function corporationsReading(
  accounts: readonly AccountCorpAccess[],
  capabilities: readonly CorpCapability[]
): number {
  const corporations = new Set<number>();
  for (const { access } of accounts) {
    const reads =
      capabilities.length === 0
        ? !isNpcCorporationId(access.corporationId)
        : capabilities.some((capability) => access.can(capability));
    if (reads) {
      corporations.add(access.corporationId);
    }
  }
  return corporations.size;
}

export async function accountCorpReaders(
  capability: CorpCapability,
  preferredCharacterId?: number
): Promise<Map<number, number>> {
  return corpReadersFor(await loadAccountCorpAccess(), capability, preferredCharacterId);
}
