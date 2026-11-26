import { requiredScopesForEndpoints, type EsiEndpointId, type ScopeGroup } from '@/esi/registry';
import { permissionForScope } from '@/esi/scopes';

export function missingPermissions(
  endpoints: readonly EsiEndpointId[],
  granted: readonly string[]
): ScopeGroup[] {
  const held = new Set(granted);
  return permissionsForScopes(requiredScopesForEndpoints(endpoints).filter((s) => !held.has(s)));
}

export function permissionsForScopes(scopes: readonly string[]): ScopeGroup[] {
  const groups: ScopeGroup[] = [];
  for (const scope of scopes) {
    const group = permissionForScope(scope);
    if (group !== undefined && !groups.includes(group)) groups.push(group);
  }
  return groups;
}
