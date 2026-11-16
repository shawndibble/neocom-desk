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
  return permissionsForScopes(requiredScopesForEndpoints(endpoints).filter((s) => !held.has(s)));
}

/** Each scope's Permission, once, in order; a Core Grant scope (no Permission) drops out. */
export function permissionsForScopes(scopes: readonly string[]): ScopeGroup[] {
  const groups: ScopeGroup[] = [];
  for (const scope of scopes) {
    const group = permissionForScope(scope);
    if (group !== undefined && !groups.includes(group)) groups.push(group);
  }
  return groups;
}
