/**
 * Whether a Character's stored grant holds the scope an endpoint needs.
 *
 * The one lookup behind two opposite questions: `cache.ts` asks "was this scope
 * granted and ESI refused it anyway" (a stale grant, worth the shell notice)
 * and `writeAuthFailure.ts` asks "was it never granted" (a Permission to ask
 * for). Kept together so the two cannot drift on what counts as held.
 *
 * True for an endpoint that needs no scope, or one this app does not model:
 * there is nothing a grant could be missing.
 */
import { db } from '@/db';
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId } from './registry';

export async function grantHoldsEndpointScope(
  characterId: number,
  endpointId: string
): Promise<boolean> {
  const spec = ESI_REGISTRY[endpointId as EsiEndpointId] as
    (typeof ESI_REGISTRY)[EsiEndpointId] | undefined;
  if (!spec || !isScopeRequired(spec.scope)) return true;
  const token = await db.tokens.get(characterId);
  return (token?.scopes ?? []).includes(spec.scope);
}
