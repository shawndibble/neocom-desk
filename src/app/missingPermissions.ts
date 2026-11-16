import { requiredScopesForEndpoints, type EsiEndpointId, type ScopeGroup } from '@/esi/registry';
import { permissionForScope } from '@/esi/scopes';

/**
 * The Permissions a grant lacks for `endpoints`, in the order the endpoints
 * name them: the scopes those endpoints need that `granted` does not hold,
 * each named by its Permission once. What a re-login banner lists, so it says
 * exactly what to tick at EVE rather than "something is missing".
 */
export function missingPermissions(
  endpoints: readonly EsiEndpointId[],
  granted: readonly string[]
): ScopeGroup[] {
  const held = new Set(granted);
  const missing: ScopeGroup[] = [];
  for (const scope of requiredScopesForEndpoints(endpoints)) {
    if (held.has(scope)) continue;
    const group = permissionForScope(scope);
    if (group !== undefined && !missing.includes(group)) missing.push(group);
  }
  return missing;
}
