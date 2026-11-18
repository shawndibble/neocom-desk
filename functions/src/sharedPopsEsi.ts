// Public ESI reads Shared Pops need (issue #6223): which corporation and alliance each Character
// is in, and the book corporation's alliance. No token, no scope; same identification headers as
// every other ESI call (esiClient.ts). Affiliations are cached a few minutes per Character so a
// Calendar refresh or a notification sweep does not ask again.

import { ESI_BASE, esiGet } from './esiClient.js';
import { throwForEsi } from './esiThrow.js';
import { chunk } from './chunk.js';

export interface Affiliation {
  corporationId: number;
  allianceId: number | null;
}

/** Each Character's corporation and alliance; a Character ESI does not answer for is left out. */
export type AffiliationLookup = (
  characterIds: readonly number[]
) => Promise<Map<number, Affiliation>>;

/** A corporation's alliance, or null outside one. */
export type CorporationAllianceLookup = (corporationId: number) => Promise<number | null>;

/** How long one Character's affiliation is trusted (ESI itself caches the endpoint for an hour). */
export const AFFILIATION_CACHE_MS = 5 * 60_000;
/** ESI's limit on ids per affiliation request. */
const AFFILIATION_BATCH = 1000;

export function esiAffiliations(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): AffiliationLookup {
  const cache = new Map<number, { at: number; value: Affiliation }>();
  return async (characterIds) => {
    const out = new Map<number, Affiliation>();
    const ask: number[] = [];
    for (const id of new Set(characterIds)) {
      const hit = cache.get(id);
      if (hit && now() - hit.at < AFFILIATION_CACHE_MS) out.set(id, hit.value);
      else ask.push(id);
    }
    for (const ids of chunk(ask, AFFILIATION_BATCH)) {
      const { body } = throwForEsi(
        await esiGet(`${ESI_BASE}/characters/affiliation/`, { body: ids, fetchImpl })
      );
      if (!Array.isArray(body)) continue;
      for (const row of body as Record<string, unknown>[]) {
        if (typeof row?.character_id !== 'number' || typeof row.corporation_id !== 'number')
          continue;
        const value: Affiliation = {
          corporationId: row.corporation_id,
          allianceId: typeof row.alliance_id === 'number' ? row.alliance_id : null,
        };
        cache.set(row.character_id, { at: now(), value });
        out.set(row.character_id, value);
      }
    }
    return out;
  };
}

export function esiCorporationAlliance(fetchImpl: typeof fetch = fetch): CorporationAllianceLookup {
  return async (corporationId) => {
    const { body: raw } = throwForEsi(
      await esiGet(`${ESI_BASE}/corporations/${corporationId}/`, { fetchImpl })
    );
    const body = raw as { alliance_id?: unknown } | null;
    return typeof body?.alliance_id === 'number' ? body.alliance_id : null;
  };
}
