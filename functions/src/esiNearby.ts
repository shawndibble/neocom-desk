import { ESI_ROOT, esiGet } from './esiClient.js';
import type { IncursionListing, RaidableSkyhook } from './nearbyAlerts.js';
import { isRecord } from './guards.js';

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
  const got = await esiGet(`${ESI_ROOT}${path}`, {
    token: accessToken,
    timeoutMs: TIMEOUT_MS,
    fetchImpl,
  });
  switch (got.kind) {
    case 'ok':
      return { kind: 'ok', body: got.body ?? undefined, budgetLow: got.budgetLow };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'backoff':
      return { kind: 'backoff', retryAfterMs: got.retryAfterMs };
    case 'error':
      return { kind: 'error', status: got.status ?? 0 };
    case 'expired':
      return { kind: 'error', status: 401 };
    case 'not-found':
      return { kind: 'error', status: 404 };
    case 'not-modified':
      return { kind: 'error', status: 304 };
  }
}

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

export async function fetchIncursions(
  fetchImpl: typeof fetch = fetch
): Promise<PublicListResult<IncursionListing>> {
  const res = await getJson('/incursions', null, fetchImpl);
  if (res.kind !== 'ok') return res;
  if (!Array.isArray(res.body)) return { kind: 'error', status: 200 };
  return { kind: 'ok', value: res.body.filter(isIncursion), budgetLow: res.budgetLow };
}

export async function fetchRaidableSkyhooks(
  fetchImpl: typeof fetch = fetch
): Promise<PublicListResult<RaidableSkyhook>> {
  const res = await getJson('/skyhooks/raidable', null, fetchImpl);
  if (res.kind !== 'ok') return res;
  const list = isRecord(res.body) ? res.body.skyhooks : undefined;
  if (!Array.isArray(list)) return { kind: 'error', status: 200 };
  return { kind: 'ok', value: list.filter(isSkyhook), budgetLow: res.budgetLow };
}
