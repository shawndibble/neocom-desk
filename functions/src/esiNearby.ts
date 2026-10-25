// The ESI reads behind nearby alerts (issue #5122, ADR 0027): one Character's location
// under its Alerts Grant, and the two public lists, read once per poll run. Same
// etiquette as esiNotifications.ts: ESI's identification headers (no email address),
// and a classified result so the poller never reads a status code — 403 is "this grant
// cannot read the location", 420/429 stop the run, a low budget stops it after this call.

import {
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  isBudgetLow,
  retryAfterMs,
} from './esiNotifications.js';
import type { IncursionListing, RaidableSkyhook } from './nearbyAlerts.js';

/** The compatibility-date routed base the app uses (`src/esi/client.ts`); the raidable list has no `/latest` route. */
const ESI_ROOT = 'https://esi.evetech.net';
const TIMEOUT_MS = 15_000;

type Failure =
  | { kind: 'forbidden' }
  | { kind: 'backoff'; retryAfterMs: number | null }
  | { kind: 'error'; status: number };

export type LocationResult = { kind: 'ok'; solarSystemId: number; budgetLow: boolean } | Failure;

export type PublicListResult<T> = { kind: 'ok'; value: T[]; budgetLow: boolean } | Failure;

async function getJson(
  path: string,
  accessToken: string | null,
  fetchImpl: typeof fetch
): Promise<{ kind: 'ok'; body: unknown; budgetLow: boolean } | Failure> {
  const res = await fetchImpl(`${ESI_ROOT}${path}`, {
    headers: {
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
      'User-Agent': ESI_USER_AGENT,
      'X-User-Agent': ESI_USER_AGENT,
      'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 403) return { kind: 'forbidden' };
  if (res.status === 420 || res.status === 429) {
    return { kind: 'backoff', retryAfterMs: retryAfterMs(res.headers) };
  }
  if (!res.ok) return { kind: 'error', status: res.status };
  const body: unknown = await res.json().catch(() => undefined);
  return { kind: 'ok', body, budgetLow: isBudgetLow(res.headers) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** `GET /characters/{id}/location` (scope `esi-location.read_location.v1`). */
export async function fetchCharacterLocation(
  characterId: number,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<LocationResult> {
  const res = await getJson(`/characters/${characterId}/location`, accessToken, fetchImpl);
  if (res.kind !== 'ok') return res;
  const systemId = isRecord(res.body) ? res.body.solar_system_id : undefined;
  if (typeof systemId !== 'number' || !Number.isSafeInteger(systemId)) {
    return { kind: 'error', status: 200 };
  }
  return { kind: 'ok', solarSystemId: systemId, budgetLow: res.budgetLow };
}

function isIncursion(v: unknown): v is IncursionListing {
  return (
    isRecord(v) &&
    typeof v.constellation_id === 'number' &&
    typeof v.staging_solar_system_id === 'number' &&
    typeof v.state === 'string'
  );
}

function isSkyhook(v: unknown): v is RaidableSkyhook {
  if (!isRecord(v) || typeof v.solar_system_id !== 'number' || typeof v.planet_id !== 'number') {
    return false;
  }
  const w = v.theft_vulnerability;
  return (
    w === undefined || (isRecord(w) && typeof w.start === 'string' && typeof w.end === 'string')
  );
}

/** `GET /incursions` (public). */
export async function fetchIncursions(
  fetchImpl: typeof fetch = fetch
): Promise<PublicListResult<IncursionListing>> {
  const res = await getJson('/incursions', null, fetchImpl);
  if (res.kind !== 'ok') return res;
  if (!Array.isArray(res.body)) return { kind: 'error', status: 200 };
  return { kind: 'ok', value: res.body.filter(isIncursion), budgetLow: res.budgetLow };
}

/** `GET /skyhooks/raidable` (public): `{ skyhooks: [...] }`. */
export async function fetchRaidableSkyhooks(
  fetchImpl: typeof fetch = fetch
): Promise<PublicListResult<RaidableSkyhook>> {
  const res = await getJson('/skyhooks/raidable', null, fetchImpl);
  if (res.kind !== 'ok') return res;
  const list = isRecord(res.body) ? res.body.skyhooks : undefined;
  if (!Array.isArray(list)) return { kind: 'error', status: 200 };
  return { kind: 'ok', value: list.filter(isSkyhook), budgetLow: res.budgetLow };
}
