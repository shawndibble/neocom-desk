import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId } from '@/esi/registry';

export function grantCovers(
  held: ReadonlySet<string>,
  endpoints: readonly EsiEndpointId[]
): boolean {
  return endpoints.every((endpoint) => {
    const { scope } = ESI_REGISTRY[endpoint];
    return !isScopeRequired(scope) || held.has(scope);
  });
}
