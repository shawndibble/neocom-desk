import { HttpsError } from 'firebase-functions/v2/https';
import type { EsiGetResult } from './esiClient.js';

export interface ThrowForEsiMap {
  /** A 404 becomes this error instead of `esi-error`. */
  notFound?: HttpsError;
  /** 401/403 become permission-denied `esi-forbidden` only when set; otherwise `esi-error`. */
  forbidden?: boolean;
}

/**
 * The callable-site adapter: throws the HttpsError for any non-ok result, so a
 * network/timeout failure reads `unavailable` / `esi-error`, never a raw `internal`.
 * Returns the ok result (narrowed). A `not-modified` result is an error here.
 */
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
