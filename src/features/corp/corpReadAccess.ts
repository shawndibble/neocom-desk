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
import { ESI_REGISTRY } from '@/esi/registry';
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
