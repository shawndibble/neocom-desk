// The public reads behind the polled server-pushed events (issue #5121): a
// Character's zKillboard losses and a hub station's Fuzzwork aggregates, the
// same sources the app reads (`src/lib/zkillboard.ts`, `src/market/fuzzwork.ts`).
// Neither needs a token. Both send the app's descriptive User-Agent, which
// carries no email address.

import { ESI_USER_AGENT } from './esiNotifications.js';
import type { LossRead } from './serverEventPoll.js';
import type { ShipLossEntry } from './serverEvents.js';

const ZKILL_LOSSES = 'https://zkillboard.com/api/losses/characterID/';
const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';
/** Fuzzwork batches poorly past this many types per request (the app's own cap). */
const FUZZWORK_MAX_TYPES = 200;
const TIMEOUT_MS = 15_000;

const HEADERS = { 'User-Agent': ESI_USER_AGENT, Accept: 'application/json' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * A `losses/characterID` body as the app reads it (`parsePilotKillmails` +
 * `fetchPilotKillmailHistory`): entries with a readable victim and time only,
 * since the client's alert never sees the others. Null for a body that is not
 * a list.
 */
export function parseZkillLosses(body: unknown): ShipLossEntry[] | null {
  if (!Array.isArray(body)) return null;
  const losses: ShipLossEntry[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const zkb = isRecord(entry.zkb) ? entry.zkb : null;
    // No hull, no detail: the app's `parseVictim` drops it, so its alert never sees it.
    if (typeof zkb?.hash !== 'string' || !isRecord(entry.victim)) continue;
    if (typeof entry.victim.ship_type_id !== 'number') continue;
    const timeMs =
      typeof entry.killmail_time === 'string' ? Date.parse(entry.killmail_time) : Number.NaN;
    if (!Number.isFinite(timeMs)) continue;
    const shipTypeId = finite(entry.victim.ship_type_id);
    const systemId = finite(entry.solar_system_id);
    const value = finite(zkb.totalValue);
    losses.push({
      killmailId: entry.killmail_id,
      timeMs,
      ...(shipTypeId === undefined ? {} : { shipTypeId }),
      ...(systemId === undefined ? {} : { systemId }),
      ...(value === undefined ? {} : { value }),
    });
  }
  return losses;
}

export async function fetchZkillLosses(
  characterId: number,
  fetchImpl: typeof fetch = fetch
): Promise<LossRead> {
  try {
    const res = await fetchImpl(`${ZKILL_LOSSES}${characterId}/`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 420) return { kind: 'backoff' };
    if (!res.ok) return { kind: 'error' };
    const losses = parseZkillLosses(await res.json());
    return losses === null ? { kind: 'error' } : { kind: 'ok', losses };
  } catch {
    return { kind: 'error' };
  }
}

/** The lowest sell order at the station, or null: no orders on that side is no price, never 0. */
function sellMin(raw: unknown): number | null {
  if (!isRecord(raw) || !isRecord(raw.sell)) return null;
  if (!(Number(raw.sell.orderCount) > 0)) return null;
  const price = Number(raw.sell.min);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Lowest sell per type at one station, or null when any batch fails. */
export async function fetchFuzzworkPrices(
  stationId: number,
  typeIds: readonly number[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<number, number | null> | null> {
  const prices = new Map<number, number | null>();
  try {
    for (let i = 0; i < typeIds.length; i += FUZZWORK_MAX_TYPES) {
      const batch = typeIds.slice(i, i + FUZZWORK_MAX_TYPES);
      const res = await fetchImpl(
        `${FUZZWORK_AGGREGATES}?station=${stationId}&types=${batch.join(',')}`,
        { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      if (!res.ok) return null;
      const body: unknown = await res.json();
      if (!isRecord(body)) return null;
      for (const typeId of batch) prices.set(typeId, sellMin(body[String(typeId)]));
    }
    return prices;
  } catch {
    return null;
  }
}
