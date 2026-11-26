import { HttpsError } from 'firebase-functions/v2/https';
import type { EsiGetResult } from './esiClient.js';

export interface ThrowForEsiMap {
  notFound?: HttpsError;
  forbidden?: boolean;
}

export function throwForEsi(
  res: EsiGetResult,
  map: ThrowForEsiMap = {}
): Extract<EsiGetResult, { kind: 'ok' }> {
  switch (res.kind) {
    case 'ok':
      return res;
    case 'backoff':
      throw new HttpsError('resource-exhausted', 'ESI is rate limiting; try again shortly', {
        reason: 'esi-backoff',
      });
    case 'not-found':
      if (map.notFound) throw map.notFound;
      break;
    case 'forbidden':
    case 'expired':
      if (map.forbidden) {
        throw new HttpsError('permission-denied', 'ESI refused this Character', {
          reason: 'esi-forbidden',
        });
      }
      break;
  }
  const status =
    res.kind === 'error' ? res.status : res.kind === 'not-modified' ? 304 : statusOf(res.kind);
  throw new HttpsError(
    'unavailable',
    status === null ? 'ESI did not answer; try again shortly' : `ESI answered ${status}`,
    { reason: 'esi-error' }
  );
}

function statusOf(kind: 'forbidden' | 'expired' | 'not-found'): number {
  return kind === 'forbidden' ? 403 : kind === 'expired' ? 401 : 404;
}
