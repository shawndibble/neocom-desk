// Its own module so `GrantNote.tsx` exports components only.
import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { beginEveLogin } from './loginFlow';

/**
 * The Grant action every per-page "this needs a Permission" CTA shares: a
 * re-login for `characterId` asking for the Permission(s) `endpoints` belong
 * to (none for a Core Grant endpoint, which makes it a plain re-login).
 *
 * `characterId` is required, never the active one by default: in a
 * multi-Character view the Character whose data needs the grant is often not
 * the active one, and SSO issues exactly what was requested — so defaulting
 * would union in the wrong Character's grant (`beginEveLogin`'s docs).
 */
export function beginGrant(
  characterId: number,
  endpoints: readonly EsiEndpointId[]
): Promise<void> {
  return beginEveLogin({ characterId, groups: permissionsForEndpoints(endpoints) });
}
