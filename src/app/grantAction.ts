import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { beginEveLogin } from './loginFlow';

export function beginGrant(
  characterId: number,
  endpoints: readonly EsiEndpointId[]
): Promise<void> {
  return beginEveLogin({ characterId, groups: permissionsForEndpoints(endpoints) });
}
