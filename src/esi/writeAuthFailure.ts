import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure, EsiError } from './client';
import { grantHoldsEndpointScope } from './grantScope';
import type { EsiEndpointId } from './registry';

export type WriteAuthOutcome = 'ignored' | 'refused' | 'grant-needed';

export async function reportWriteAuthFailure(
  characterId: number,
  err: unknown,
  endpointId: EsiEndpointId
): Promise<WriteAuthOutcome> {
  if (!isAuthFailure(err)) return 'ignored';
  if (!(err instanceof EsiError) || err.status === 401) {
    emitEsiAuthFailure(characterId);
    return 'refused';
  }
  if (await grantHoldsEndpointScope(characterId, endpointId)) return 'refused';
  emitEsiAuthFailure(characterId, endpointId);
  return 'grant-needed';
}
