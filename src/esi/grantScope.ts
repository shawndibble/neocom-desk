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
