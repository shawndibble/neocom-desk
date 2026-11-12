/**
 * The corp gate for a *loader*: which corporation a Character is in, and
 * which corp reads its roles and grant cover — settled before any corp call.
 *
 * `useCorpAccess` answers the same question for a component, as a hook. A
 * loader cannot call a hook, and it must not fetch first and let a 403 decide
 * (CCP role-gates these endpoints server-side), so the rule is here once for
 * every loader that reads corp data on a Character's behalf: the roles scope,
 * then the corporation, then the roles, then the capability's own scopes.
 */
import { db } from '@/db';
import { corpCapabilities, type CorpCapabilities } from '@/engine/corpRoles';
import { isNpcCorporationId } from '@/esi/entityIds';
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { loadCorporationId } from './boardData';
import { CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { corpWideRoles, loadCharacterRoles } from './roles';

export type CorpCapability = keyof CorpCapabilities;

export interface CorpReadAccess {
  corporationId: number;
  /** Whether the Character's roles open `capability` and its grant holds that capability's scopes. */
  can: (capability: CorpCapability) => boolean;
}

/**
 * Null when nothing corp-side is readable at all: the roles scope was never
 * granted, the corporation is unknown, or the roles read failed.
 */
export async function resolveCorpReadAccess(characterId: number): Promise<CorpReadAccess | null> {
  const granted = new Set((await db.tokens.get(characterId))?.scopes ?? []);
  // Without this scope the roles read is a guaranteed 403, and asking raises
  // the app-wide re-auth notice over a page that never needed corp data.
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

// --- Every corporation the account can read ---------------------------------------

/** One stored Character's corp gate. */
export interface AccountCorpAccess {
  characterId: number;
  access: CorpReadAccess;
}

/**
 * Every stored Character's corp gate, in account order (never completion
 * order, so the reader picked for a corporation is stable). A Character with
 * nothing corp-side readable, or whose gate could not be settled, is absent:
 * unknown standing is never a hint to try.
 */
export async function loadAccountCorpAccess(): Promise<AccountCorpAccess[]> {
  const { entries } = await fanOutAllCharacters({
    load: async ({ characterId }) => {
      const access = await resolveCorpReadAccess(characterId);
      return access === null ? null : { characterId, access };
    },
  });
  return entries;
}

/**
 * One reader per corporation that can read `capability`: the preferred
 * Character (the active one, whose reads share their cache rows with `/corp`)
 * when it can, else the first that can. A corporation no Character can read
 * for it is absent, so no request is ever made for it. `null` is an ungated
 * read (Corp kills, public): every player corporation a Character's corp gate settled for.
 */
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

/**
 * How many corporations some Character can read for any of `capabilities`; with none
 * (an ungated kind, Corp kills), every player corporation a Character's corp gate settled for.
 */
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

/** `corpReadersFor` over every stored Character: corporation id -> the Character to read it through. */
export async function accountCorpReaders(
  capability: CorpCapability,
  preferredCharacterId?: number
): Promise<Map<number, number>> {
  return corpReadersFor(await loadAccountCorpAccess(), capability, preferredCharacterId);
}
