/**
 * EVE-Scout's public list of Thera and Turnur wormhole connections (issue
 * #2330). EVE-Scout is a third-party service, not ESI: a plain browser fetch
 * with no custom headers (the endpoint allows cross-origin reads, and a
 * custom header would force a preflight it need not answer).
 *
 * Held in memory for five minutes — the scouts update the list by hand, so a
 * tighter loop only adds load on a volunteer service. A failed refresh keeps
 * the last good list rather than blanking the table.
 */
import {
  HUB_SYSTEM_IDS,
  WORMHOLE_SHIP_SIZES,
  type TheraConnection,
  type TheraHub,
  type WormholeShipSize,
} from '@/engine/route/theraConnections';

export const EVE_SCOUT_SIGNATURES_URL = 'https://api.eve-scout.com/v2/public/signatures';

export const EVE_SCOUT_CACHE_MS = 5 * 60 * 1000;

export type TheraConnectionsResult =
  { kind: 'ok'; connections: TheraConnection[]; fetchedAt: Date } | { kind: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function id(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function hubOf(systemId: unknown): TheraHub | null {
  for (const [hub, hubId] of Object.entries(HUB_SYSTEM_IDS)) {
    if (systemId === hubId) return hub as TheraHub;
  }
  return null;
}

function shipSize(value: unknown): WormholeShipSize | null {
  return typeof value === 'string' && (WORMHOLE_SHIP_SIZES as readonly string[]).includes(value)
    ? (value as WormholeShipSize)
    : null;
}

/**
 * Reads the signatures response defensively: an entry that is not a wormhole
 * out of Thera or Turnur, or lacks an exit system or an expiry, is dropped;
 * optional fields that are missing or unrecognised come back `null`.
 *
 * Field names confirmed against a live response on 2026-09-30:
 * `out_*` is the hub side, `in_*` the exit side.
 */
export function parseEveScoutSignatures(body: unknown): TheraConnection[] {
  if (!Array.isArray(body)) return [];
  const connections: TheraConnection[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || entry.signature_type !== 'wormhole') continue;
    const hub = hubOf(entry.out_system_id);
    const exitSystemId = id(entry.in_system_id);
    const expiresAt = typeof entry.expires_at === 'string' ? Date.parse(entry.expires_at) : NaN;
    const entryId = text(entry.id) ?? (typeof entry.id === 'number' ? String(entry.id) : null);
    if (hub === null || exitSystemId === null || Number.isNaN(expiresAt) || entryId === null) {
      continue;
    }
    connections.push({
      id: entryId,
      hub,
      hubSignature: text(entry.out_signature),
      exitSignature: text(entry.in_signature),
      exitSystemId,
      exitSystemName: text(entry.in_system_name),
      exitClass: text(entry.in_system_class),
      exitRegionName: text(entry.in_region_name),
      wormholeType: text(entry.wh_type),
      maxShipSize: shipSize(entry.max_ship_size),
      expiresAt,
    });
  }
  return connections;
}

let cached: { at: number; result: Extract<TheraConnectionsResult, { kind: 'ok' }> } | null = null;
let inFlight: Promise<TheraConnectionsResult> | null = null;

async function fetchConnections(now: number): Promise<TheraConnectionsResult> {
  try {
    const response = await fetch(EVE_SCOUT_SIGNATURES_URL);
    if (!response.ok) throw new Error(`EVE-Scout answered ${response.status}`);
    const result = {
      kind: 'ok' as const,
      connections: parseEveScoutSignatures(await response.json()),
      fetchedAt: new Date(now),
    };
    cached = { at: now, result };
    return result;
  } catch {
    return cached?.result ?? { kind: 'unavailable' };
  }
}

/** Never rejects. `now` is injectable for tests; callers leave it out. */
export function loadTheraConnections(now = Date.now()): Promise<TheraConnectionsResult> {
  if (cached && now - cached.at <= EVE_SCOUT_CACHE_MS) return Promise.resolve(cached.result);
  inFlight ??= fetchConnections(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam. */
export function clearEveScoutCache(): void {
  cached = null;
  inFlight = null;
}
