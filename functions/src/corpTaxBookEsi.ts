import { HttpsError } from 'firebase-functions/v2/https';
import { ESI_BASE, esiGet } from './esiClient.js';
import { throwForEsi } from './esiThrow.js';

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
  return throwForEsi(await esiGet(url, { token: accessToken, fetchImpl }), { forbidden: true })
    .body;
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

export type CorporationCeoLookup = (corporationId: number) => Promise<number | undefined>;

export function esiCorporationCeoLookup(fetchImpl: typeof fetch = fetch): CorporationCeoLookup {
  return async (corporationId) => {
    const corp = await getJson(`${ESI_BASE}/corporations/${corporationId}/`, null, fetchImpl);
    const ceo = (corp as { ceo_id?: unknown } | null)?.ceo_id;
    return typeof ceo === 'number' && ceo > 1 ? ceo : undefined;
  };
}

export type CorporationLookup = (characterId: number) => Promise<number>;

export function esiCorporationLookup(fetchImpl: typeof fetch = fetch): CorporationLookup {
  return async (characterId) => {
    const { body } = throwForEsi(
      await esiGet(`${ESI_BASE}/characters/affiliation/`, { body: [characterId], fetchImpl })
    );
    const row = Array.isArray(body)
      ? (body as { character_id?: unknown; corporation_id?: unknown }[]).find(
          (r) => r?.character_id === characterId
        )
      : undefined;
    if (typeof row?.corporation_id !== 'number') {
      throw new HttpsError('unavailable', 'ESI sent no corporation', { reason: 'esi-error' });
    }
    return row.corporation_id;
  };
}

export type IdCategoryLookup = (id: number) => Promise<string | undefined>;

export function esiIdCategoryLookup(fetchImpl: typeof fetch = fetch): IdCategoryLookup {
  return async (id) => {
    const got = await esiGet(`${ESI_BASE}/universe/names/`, { body: [id], fetchImpl });
    if (got.kind === 'not-found') return undefined;
    const { body } = throwForEsi(got);
    const hit = Array.isArray(body)
      ? (body as { id?: unknown; category?: unknown }[]).find((e) => e?.id === id)
      : undefined;
    return typeof hit?.category === 'string' ? hit.category : undefined;
  };
}
