// What the Corp Tax Book needs from ESI to trust an officer: the Character's
// corporation and in-game roles, and the corporation's CEO (ADR 0023). The
// caller's short-lived access token is used for these calls and dropped; it is
// never stored or logged (ADR 0001, ADR 0010). Same identification headers as
// every other ESI call (esiNotifications.ts).

import { HttpsError } from 'firebase-functions/v2/https';
import { ESI_BASE, esiHeaders } from './esiClient.js';

export const ROLES_SCOPE = 'esi-characters.read_corporation_roles.v1';

export interface CorpIdentity {
  corporationId: number;
  ceoId: number | null;
  roles: string[];
}

export type IdentityReader = (characterId: number, accessToken: string) => Promise<CorpIdentity>;

async function getJson(
  url: string,
  accessToken: string | null,
  fetchImpl: typeof fetch
): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: esiHeaders(accessToken),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403 || res.status === 401) {
    throw new HttpsError('permission-denied', 'ESI refused this Character', {
      reason: 'esi-forbidden',
    });
  }
  if (res.status === 420 || res.status === 429) {
    throw new HttpsError('resource-exhausted', 'ESI is rate limiting; try again shortly', {
      reason: 'esi-backoff',
    });
  }
  if (!res.ok)
    throw new HttpsError('unavailable', `ESI answered ${res.status}`, { reason: 'esi-error' });
  return res.json().catch(() => null);
}

export function esiIdentityReader(fetchImpl: typeof fetch = fetch): IdentityReader {
  return async (characterId, accessToken) => {
    const [character, roles] = await Promise.all([
      getJson(`${ESI_BASE}/characters/${characterId}/`, null, fetchImpl),
      getJson(`${ESI_BASE}/characters/${characterId}/roles/`, accessToken, fetchImpl),
    ]);
    const corporationId = (character as { corporation_id?: unknown } | null)?.corporation_id;
    if (typeof corporationId !== 'number') {
      throw new HttpsError('unavailable', 'ESI sent no corporation', { reason: 'esi-error' });
    }
    const corporation = await getJson(
      `${ESI_BASE}/corporations/${corporationId}/`,
      null,
      fetchImpl
    );
    const ceoId = (corporation as { ceo_id?: unknown } | null)?.ceo_id;
    const rolesList = (roles as { roles?: unknown } | null)?.roles;
    return {
      corporationId,
      ceoId: typeof ceoId === 'number' ? ceoId : null,
      roles: Array.isArray(rolesList)
        ? rolesList.filter((r): r is string => typeof r === 'string')
        : [],
    };
  };
}

/** The public lookup of a corporation's CEO: no token, no scope. */
export type CorporationCeoLookup = (corporationId: number) => Promise<number | undefined>;

export function esiCorporationCeoLookup(fetchImpl: typeof fetch = fetch): CorporationCeoLookup {
  return async (corporationId) => {
    const corp = await getJson(`${ESI_BASE}/corporations/${corporationId}/`, null, fetchImpl);
    const ceo = (corp as { ceo_id?: unknown } | null)?.ceo_id;
    return typeof ceo === 'number' && ceo > 1 ? ceo : undefined;
  };
}

/** The public lookup of which corporation a Character is in: no token, no scope. */
export type CorporationLookup = (characterId: number) => Promise<number>;

export function esiCorporationLookup(fetchImpl: typeof fetch = fetch): CorporationLookup {
  return async (characterId) => {
    const character = await getJson(`${ESI_BASE}/characters/${characterId}/`, null, fetchImpl);
    const corporationId = (character as { corporation_id?: unknown } | null)?.corporation_id;
    if (typeof corporationId !== 'number') {
      throw new HttpsError('unavailable', 'ESI sent no corporation', { reason: 'esi-error' });
    }
    return corporationId;
  };
}

/** What ESI calls an id (`character`, `corporation`, ...); undefined when ESI knows no such id. */
export type IdCategoryLookup = (id: number) => Promise<string | undefined>;

/** ESI's public `POST /universe/names/`: one id in, its category out. No token, no scope. */
export function esiIdCategoryLookup(fetchImpl: typeof fetch = fetch): IdCategoryLookup {
  return async (id) => {
    const res = await fetchImpl(`${ESI_BASE}/universe/names/`, {
      method: 'POST',
      headers: { ...esiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify([id]),
      signal: AbortSignal.timeout(15_000),
    });
    // ESI answers 404 when an id in the list is not a valid id.
    if (res.status === 404) return undefined;
    if (res.status === 420 || res.status === 429) {
      throw new HttpsError('resource-exhausted', 'ESI is rate limiting; try again shortly', {
        reason: 'esi-backoff',
      });
    }
    if (!res.ok)
      throw new HttpsError('unavailable', `ESI answered ${res.status}`, { reason: 'esi-error' });
    const body = (await res.json().catch(() => null)) as unknown;
    const hit = Array.isArray(body)
      ? (body as { id?: unknown; category?: unknown }[]).find((e) => e?.id === id)
      : undefined;
    return typeof hit?.category === 'string' ? hit.category : undefined;
  };
}
