// The ESI reads the scheduled Corp Tax Book sync makes with the grant holder's
// access token (issue #4068, ADR 0025): the same five reads an officer's visit
// feeds into the book. Same identification headers as every server ESI call
// (esiNotifications.ts); 401/403 are a refusal of this token (the run stops the
// schedule), 420/429 stop the whole run (the error budget is shared by every
// user of the client id), anything else is "try again next run". Nothing here
// logs or returns a token.

import {
  ESI_BASE,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  isBudgetLow,
} from './esiNotifications.js';
import type {
  EsiExtractionLike,
  JournalEntryLike,
  LedgerRowLike,
} from './corpTaxBookSyncEngine.js';

/** A paginated read gives up after this many pages and says it is incomplete. */
export const MAX_PAGES = 60;
const TIMEOUT_MS = 20_000;

export type EsiRead<T> =
  | { kind: 'ok'; data: T; fetchedAt: string; truncated: boolean }
  | { kind: 'forbidden' }
  | { kind: 'backoff' }
  | { kind: 'unavailable' };

export interface EsiNotificationLike {
  type: string;
  timestamp: string;
  text?: string;
}

export interface SyncEsi {
  /** Every refinery that keeps a ledger (`observer_id`s). */
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
  /** The refinery's solar system, or `unavailable` when this Character is not on its ACL. */
  structureSystem(structureId: number, accessToken: string): Promise<EsiRead<number>>;
  /** True once ESI's headers say the next call risks the shared budget. */
  budgetLow(): boolean;
}

export function esiSyncReader(fetchImpl: typeof fetch = fetch): SyncEsi {
  let low = false;

  async function get(
    path: string,
    accessToken: string
  ): Promise<
    { kind: 'ok'; body: unknown; pages: number } | { kind: 'fail'; read: EsiRead<never> }
  > {
    let res: Response;
    try {
      res = await fetchImpl(`${ESI_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': ESI_USER_AGENT,
          'X-User-Agent': ESI_USER_AGENT,
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { kind: 'fail', read: { kind: 'unavailable' } };
    }
    if (isBudgetLow(res.headers)) low = true;
    if (res.status === 401 || res.status === 403) {
      return { kind: 'fail', read: { kind: 'forbidden' } };
    }
    if (res.status === 420 || res.status === 429) {
      low = true;
      return { kind: 'fail', read: { kind: 'backoff' } };
    }
    if (!res.ok) return { kind: 'fail', read: { kind: 'unavailable' } };
    const body: unknown = await res.json().catch(() => null);
    if (body === null) return { kind: 'fail', read: { kind: 'unavailable' } };
    const pages = Number(res.headers.get('X-Pages'));
    return { kind: 'ok', body, pages: Number.isSafeInteger(pages) && pages > 1 ? pages : 1 };
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
        // An ACL refusal is a normal outcome here, not a dead token.
        return res.read.kind === 'forbidden' ? { kind: 'unavailable' } : res.read;
      }
      const system = (res.body as { solar_system_id?: unknown } | null)?.solar_system_id;
      if (typeof system !== 'number') return { kind: 'unavailable' };
      return { kind: 'ok', data: system, fetchedAt: new Date().toISOString(), truncated: false };
    },
    budgetLow: () => low,
  };
}
