import { ESI_BASE, esiGet } from './esiClient.js';
import type {
  EsiExtractionLike,
  JournalEntryLike,
  LedgerRowLike,
} from './corpTaxBookSyncEngine.js';

export const MAX_PAGES = 60;
const TIMEOUT_MS = 20_000;

export type EsiRead<T> =
  | { kind: 'ok'; data: T; fetchedAt: string; truncated: boolean }
  | { kind: 'forbidden' }
  | { kind: 'backoff' }
  | { kind: 'unavailable' };

export type StructureLookup =
  | { kind: 'ok'; name: string; solarSystemId: number }
  | { kind: 'denied' }
  | { kind: 'backoff' }
  | { kind: 'unavailable' };

export interface EsiNotificationLike {
  type: string;
  timestamp: string;
  text?: string;
}

export interface SyncEsi {
  observers(corporationId: number, accessToken: string): Promise<EsiRead<number[]>>;
  ledger(
    corporationId: number,
    observerId: number,
    accessToken: string
  ): Promise<EsiRead<LedgerRowLike[]>>;
  extractions(corporationId: number, accessToken: string): Promise<EsiRead<EsiExtractionLike[]>>;
  notifications(characterId: number, accessToken: string): Promise<EsiRead<EsiNotificationLike[]>>;
  journal(
    corporationId: number,
    division: number,
    accessToken: string
  ): Promise<EsiRead<JournalEntryLike[]>>;
  structureSystem(structureId: number, accessToken: string): Promise<EsiRead<number>>;
  structure(structureId: number, accessToken: string): Promise<StructureLookup>;
  budgetLow(): boolean;
}

export function esiSyncReader(fetchImpl: typeof fetch = fetch): SyncEsi {
  let low = false;

  async function get(
    path: string,
    accessToken: string
  ): Promise<
    | { kind: 'ok'; body: unknown; pages: number }
    | { kind: 'fail'; read: EsiRead<never>; status?: number }
  > {
    const got = await esiGet(`${ESI_BASE}${path}`, {
      token: accessToken,
      timeoutMs: TIMEOUT_MS,
      fetchImpl,
    });
    if (got.budgetLow) low = true;
    switch (got.kind) {
      case 'forbidden':
      case 'expired':
        return {
          kind: 'fail',
          read: { kind: 'forbidden' },
          status: got.kind === 'expired' ? 401 : 403,
        };
      case 'backoff':
        low = true;
        return { kind: 'fail', read: { kind: 'backoff' } };
      case 'not-found':
        return { kind: 'fail', read: { kind: 'unavailable' }, status: 404 };
      case 'error':
        return {
          kind: 'fail',
          read: { kind: 'unavailable' },
          ...(got.status === null ? {} : { status: got.status }),
        };
      case 'not-modified':
        return { kind: 'fail', read: { kind: 'unavailable' }, status: 304 };
      case 'ok':
        break;
    }
    if (got.body === null) return { kind: 'fail', read: { kind: 'unavailable' } };
    const pages = Number(got.headers.get('X-Pages'));
    return {
      kind: 'ok',
      body: got.body,
      pages: Number.isSafeInteger(pages) && pages > 1 ? pages : 1,
    };
  }

  async function paged<T>(path: string, accessToken: string): Promise<EsiRead<T[]>> {
    const first = await get(`${path}?page=1`, accessToken);
    if (first.kind === 'fail') return first.read;
    if (!Array.isArray(first.body)) return { kind: 'unavailable' };
    const data: T[] = [...(first.body as T[])];
    const last = Math.min(first.pages, MAX_PAGES);
    for (let page = 2; page <= last; page++) {
      if (low) return { kind: 'backoff' };
      const next = await get(`${path}?page=${page}`, accessToken);
      if (next.kind === 'fail') return next.read;
      if (!Array.isArray(next.body)) return { kind: 'unavailable' };
      data.push(...(next.body as T[]));
    }
    return {
      kind: 'ok',
      data,
      fetchedAt: new Date().toISOString(),
      truncated: first.pages > MAX_PAGES,
    };
  }

  return {
    async observers(corporationId, accessToken) {
      const read = await paged<{ observer_id?: unknown }>(
        `/corporation/${corporationId}/mining/observers/`,
        accessToken
      );
      if (read.kind !== 'ok') return read;
      return {
        ...read,
        data: read.data.flatMap((o) =>
          typeof o.observer_id === 'number' && Number.isSafeInteger(o.observer_id)
            ? [o.observer_id]
            : []
        ),
      };
    },
    ledger: (corporationId, observerId, accessToken) =>
      paged<LedgerRowLike>(
        `/corporation/${corporationId}/mining/observers/${observerId}/`,
        accessToken
      ),
    extractions: (corporationId, accessToken) =>
      paged<EsiExtractionLike>(`/corporation/${corporationId}/mining/extractions/`, accessToken),
    async notifications(characterId, accessToken) {
      const res = await get(`/characters/${characterId}/notifications/`, accessToken);
      if (res.kind === 'fail') return res.read;
      if (!Array.isArray(res.body)) return { kind: 'unavailable' };
      const data = (res.body as Record<string, unknown>[]).flatMap((n) =>
        typeof n.type === 'string' && typeof n.timestamp === 'string'
          ? [
              {
                type: n.type,
                timestamp: n.timestamp,
                ...(typeof n.text === 'string' ? { text: n.text } : {}),
              },
            ]
          : []
      );
      return { kind: 'ok', data, fetchedAt: new Date().toISOString(), truncated: false };
    },
    journal: (corporationId, division, accessToken) =>
      paged<JournalEntryLike>(
        `/corporations/${corporationId}/wallets/${division}/journal/`,
        accessToken
      ),
    async structureSystem(structureId, accessToken) {
      const res = await get(`/universe/structures/${structureId}/`, accessToken);
      if (res.kind === 'fail') {
        return res.read.kind === 'forbidden' ? { kind: 'unavailable' } : res.read;
      }
      const system = (res.body as { solar_system_id?: unknown } | null)?.solar_system_id;
      if (typeof system !== 'number') return { kind: 'unavailable' };
      return { kind: 'ok', data: system, fetchedAt: new Date().toISOString(), truncated: false };
    },
    async structure(structureId, accessToken) {
      const res = await get(`/universe/structures/${structureId}/`, accessToken);
      if (res.kind === 'fail') {
        if (res.status === 403 || res.status === 404) return { kind: 'denied' };
        return res.read.kind === 'backoff' ? { kind: 'backoff' } : { kind: 'unavailable' };
      }
      const body = res.body as { name?: unknown; solar_system_id?: unknown } | null;
      if (typeof body?.name !== 'string' || typeof body.solar_system_id !== 'number') {
        return { kind: 'unavailable' };
      }
      return { kind: 'ok', name: body.name, solarSystemId: body.solar_system_id };
    },
    budgetLow: () => low,
  };
}
