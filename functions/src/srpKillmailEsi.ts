import { HttpsError } from 'firebase-functions/v2/https';
import { ESI_BASE, ESI_USER_AGENT, esiGet } from './esiClient.js';
import { throwForEsi } from './esiThrow.js';
import { isFiniteNumber } from './guards.js';
import type { EsiKillmail, KillmailItem, SrpKillmailSource, ZkillRecord } from './srpKillmail.js';
import { chunk } from './chunk.js';

const ZKILL_API = 'https://zkillboard.com/api/killID';
const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';
export const JITA_STATION_ID = 60003760;
const FUZZWORK_BATCH = 200;
const MAX_APPRAISAL_TYPES = 1000;

async function esiKillmailGet(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const got = await esiGet(url, { fetchImpl });
  const missing = got.kind === 'not-found' || (got.kind === 'error' && got.status === 422);
  if (missing) {
    throw new HttpsError('not-found', 'ESI has no such killmail', { reason: 'killmail-not-found' });
  }
  return throwForEsi(got).body;
}

const asNumber = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

function cleanItems(raw: unknown): KillmailItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i: Record<string, unknown>) => ({
    ...(asNumber(i?.item_type_id) !== null
      ? { item_type_id: asNumber(i.item_type_id) as number }
      : {}),
    ...(asNumber(i?.flag) !== null ? { flag: asNumber(i.flag) as number } : {}),
    quantity_dropped: asNumber(i?.quantity_dropped) ?? 0,
    quantity_destroyed: asNumber(i?.quantity_destroyed) ?? 0,
    ...(Array.isArray(i?.items) ? { items: cleanItems(i.items) } : {}),
  }));
}

export function parseEsiKillmail(killmailId: number, body: unknown): EsiKillmail {
  const b = body as {
    killmail_time?: unknown;
    solar_system_id?: unknown;
    victim?: {
      character_id?: unknown;
      corporation_id?: unknown;
      ship_type_id?: unknown;
      items?: unknown;
    };
  } | null;
  const killedAt = typeof b?.killmail_time === 'string' ? Date.parse(b.killmail_time) : NaN;
  const shipTypeId = asNumber(b?.victim?.ship_type_id);
  const solarSystemId = asNumber(b?.solar_system_id);
  if (!Number.isFinite(killedAt) || shipTypeId === null || solarSystemId === null) {
    throw new HttpsError('unavailable', 'ESI sent an unreadable killmail', { reason: 'esi-error' });
  }
  return {
    killmailId,
    killedAt,
    solarSystemId,
    victim: {
      characterId: asNumber(b?.victim?.character_id),
      corporationId: asNumber(b?.victim?.corporation_id),
      shipTypeId,
      items: cleanItems(b?.victim?.items),
    },
  };
}

const shipGroupByTypeId = new Map<number, number>();

export function clearShipGroupCache(): void {
  shipGroupByTypeId.clear();
}

export function srpKillmailSource(fetchImpl: typeof fetch = fetch): SrpKillmailSource {
  return {
    async zkill(killmailId): Promise<ZkillRecord> {
      const none: ZkillRecord = { hash: null, totalValue: null };
      try {
        const res = await fetchImpl(`${ZKILL_API}/${killmailId}/`, {
          headers: { 'User-Agent': ESI_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return none;
        const entry = ((await res.json()) as unknown[])?.[0] as
          { zkb?: { hash?: unknown; totalValue?: unknown } } | undefined;
        const hash = entry?.zkb?.hash;
        return {
          hash:
            typeof hash === 'string' && /^[0-9a-f]{40}$/i.test(hash) ? hash.toLowerCase() : null,
          totalValue: asNumber(entry?.zkb?.totalValue),
        };
      } catch {
        return none;
      }
    },

    async killmail(killmailId, hash) {
      return parseEsiKillmail(
        killmailId,
        await esiKillmailGet(`${ESI_BASE}/killmails/${killmailId}/${hash}/`, fetchImpl)
      );
    },

    async shipGroupId(typeId) {
      const known = shipGroupByTypeId.get(typeId);
      if (known !== undefined) return known;
      const body = await esiKillmailGet(`${ESI_BASE}/universe/types/${typeId}/`, fetchImpl);
      const groupId = asNumber((body as { group_id?: unknown } | null)?.group_id);
      if (groupId === null) {
        throw new HttpsError('unavailable', 'ESI sent no group for that hull', {
          reason: 'esi-error',
        });
      }
      shipGroupByTypeId.set(typeId, groupId);
      return groupId;
    },

    async jitaValue(items) {
      if (items.size > MAX_APPRAISAL_TYPES) return null;
      const typeIds = [...items.keys()];
      let total = 0;
      try {
        for (const batch of chunk(typeIds, FUZZWORK_BATCH)) {
          const url = `${FUZZWORK_AGGREGATES}?station=${JITA_STATION_ID}&types=${batch.join(',')}`;
          const res = await fetchImpl(url, {
            headers: { 'User-Agent': ESI_USER_AGENT, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return null;
          const body = (await res.json()) as Record<
            string,
            { sell?: { min?: string | number; orderCount?: string | number } }
          >;
          for (const typeId of batch) {
            const sell = body[String(typeId)]?.sell;
            const price = Number(sell?.min);
            if (Number(sell?.orderCount) > 0 && Number.isFinite(price) && price > 0) {
              total += price * (items.get(typeId) ?? 0);
            }
          }
        }
      } catch {
        return null;
      }
      return total >= 1 ? total : null;
    },
  };
}
