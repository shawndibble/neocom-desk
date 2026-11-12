// Vetting: the ESI reads. One read of a character with the pilot's own short-lived access
// token (public sheet and history, then each source the token's scopes cover), and the public
// lookups that name what the read found. Same identification headers as every server ESI call
// (esiClient.ts). Requests go one at a time; 420/429 or a low error budget stop the read, since
// the budget is shared by every user of the client id, and after a 420/429 no reader in this
// instance calls ESI again until its `Retry-After` has passed. The token is used for these calls
// and dropped: nothing here stores, logs or returns it. Mail is read as headers only, and only
// who and when is kept.

import { fail } from './actorAuth.js';
import { chunk } from './chunk.js';
import { ESI_BASE, esiHeaders, isBudgetLow, retryAfterMs } from './esiClient.js';
import { isFiniteNumber, isPlainRecord } from './guards.js';
import type {
  VettingCharacterInput,
  VettingDealing,
  VettingParty,
  VettingSource,
  VettingWatchEntry,
} from './vettingEngine.js';
import {
  capDealings,
  contactDealings,
  contractDealings,
  historyOf,
  mailDealings,
  skillsOf,
  walletDealings,
} from './vettingRows.js';
import type { VettingScope } from './vettingScopes.js';
import { VETTING_MAX_DEALINGS } from './vettingTypes.js';

/** A paginated read stops after this many pages; ESI serves the newest rows first. */
export const VETTING_MAX_PAGES = 20;
/** Mail headers come 50 at a time, walked back by `last_mail_id`. */
export const VETTING_MAIL_PAGES = 4;
const TIMEOUT_MS = 20_000;
/** `POST /universe/names/` and `/characters/affiliation/` take at most this many ids. */
const BULK_IDS = 1000;
const BULK_NAMES = 500;
/**
 * 404s one bulk lookup may spend finding the ids ESI will not take. Each one counts against
 * the error budget every user shares, so past this the ids still in doubt are dropped.
 */
export const VETTING_BULK_MAX_MISSES = 6;
/** How long a 420/429 without a usable `Retry-After` holds requests back: ESI's error window. */
export const VETTING_BACKOFF_MS = 60_000;
/** A `Retry-After` is honoured up to this, so one bad header cannot stop vetting for a day. */
export const VETTING_BACKOFF_MAX_MS = 15 * 60_000;

/**
 * No request before this time (ms): ESI answered 420/429. Module-level, because the limit is on
 * the client id and a reader is made per call; it lasts as long as the function instance.
 */
let notBefore = 0;

/** Test seam: forgets the backoff a 420/429 left behind. */
export function resetVettingEsiBackoff(): void {
  notBefore = 0;
}

export const SOURCE_SCOPE: Record<VettingSource, VettingScope> = {
  wallet: 'esi-wallet.read_character_wallet.v1',
  contact: 'esi-characters.read_contacts.v1',
  mail: 'esi-mail.read_mail.v1',
  contract: 'esi-contracts.read_character_contracts.v1',
  skills: 'esi-skills.read_skills.v1',
};

export interface VettingAffiliation {
  characterId: number;
  corporationId: number;
  allianceId?: number;
}

export interface VettingEsi {
  /**
   * Everything one character shares. A source whose scope is not in `scopes`, or that ESI
   * refuses with 403, is listed in `missing` and contributes nothing.
   */
  readCharacter(
    characterId: number,
    accessToken: string,
    scopes: readonly string[]
  ): Promise<VettingCharacterInput>;
  /** A corporation's public name and ticker, or null when ESI knows no such corporation. */
  corporation(corporationId: number): Promise<{ name: string; ticker: string } | null>;
  /** Names and categories for ids; an id ESI cannot name is left out. */
  names(ids: readonly number[]): Promise<VettingParty[]>;
  /** Corporation and alliance of each character id. */
  affiliations(characterIds: readonly number[]): Promise<VettingAffiliation[]>;
  /** Exact in-game names to the characters, corporations and alliances that bear them. */
  ids(names: readonly string[]): Promise<VettingWatchEntry[]>;
}

type Got =
  | { kind: 'ok'; body: unknown; pages: number }
  | { kind: 'forbidden' }
  | { kind: 'expired' }
  | { kind: 'not-found' }
  | { kind: 'backoff' }
  | { kind: 'unavailable' };

const backoff = (): never =>
  fail('resource-exhausted', 'ESI is rate limiting; try again shortly', 'esi-backoff');
const unavailable = (): never =>
  fail('unavailable', 'ESI did not answer; try again shortly', 'esi-error');

export function esiVettingReader(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): VettingEsi {
  let low = false;

  async function request(path: string, accessToken: string | null, body?: unknown): Promise<Got> {
    if (low || now() < notBefore) return { kind: 'backoff' };
    let res: Response;
    try {
      res = await fetchImpl(`${ESI_BASE}${path}`, {
        ...(body === undefined
          ? { headers: esiHeaders(accessToken) }
          : {
              method: 'POST',
              headers: { ...esiHeaders(accessToken), 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { kind: 'unavailable' };
    }
    if (isBudgetLow(res.headers)) low = true;
    if (res.status === 420 || res.status === 429) {
      low = true;
      const wait = retryAfterMs(res.headers) ?? VETTING_BACKOFF_MS;
      notBefore = Math.max(notBefore, now() + Math.min(wait, VETTING_BACKOFF_MAX_MS));
      return { kind: 'backoff' };
    }
    // 403: this token may not read the source. 401: the token itself is dead, which must not
    // pass for "not shared".
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 401) return { kind: 'expired' };
    if (res.status === 404) return { kind: 'not-found' };
    if (!res.ok) return { kind: 'unavailable' };
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed === null) return { kind: 'unavailable' };
    const pages = Number(res.headers.get('X-Pages'));
    return {
      kind: 'ok',
      body: parsed,
      pages: Number.isSafeInteger(pages) && pages > 1 ? pages : 1,
    };
  }

  /** The body, or the refusal as a thrown failure; `forbidden` is left to the caller. */
  function settle(got: Got): { kind: 'ok'; body: unknown; pages: number } | { kind: 'forbidden' } {
    if (got.kind === 'ok' || got.kind === 'forbidden') return got;
    if (got.kind === 'expired') {
      return fail('permission-denied', 'ESI refused this Character', 'esi-forbidden');
    }
    return got.kind === 'backoff' ? backoff() : unavailable();
  }

  /** Every page of a list, or null when ESI refuses this token the source. */
  async function paged(path: string, accessToken: string): Promise<unknown[] | null> {
    const first = settle(await request(`${path}?page=1`, accessToken));
    if (first.kind === 'forbidden') return null;
    if (!Array.isArray(first.body)) return unavailable();
    const rows: unknown[] = [...(first.body as unknown[])];
    const last = Math.min(first.pages, VETTING_MAX_PAGES);
    for (let page = 2; page <= last; page++) {
      const next = settle(await request(`${path}?page=${page}`, accessToken));
      if (next.kind === 'forbidden') return null;
      if (!Array.isArray(next.body)) return unavailable();
      rows.push(...(next.body as unknown[]));
    }
    return rows;
  }

  /** Mail headers, newest first, walked back by `last_mail_id`. Never a body. */
  async function mailHeaders(characterId: number, accessToken: string): Promise<unknown[] | null> {
    const rows: unknown[] = [];
    let before: number | null = null;
    for (let page = 0; page < VETTING_MAIL_PAGES; page++) {
      const query: string = before === null ? '' : `?last_mail_id=${before}`;
      const got = settle(await request(`/characters/${characterId}/mail/${query}`, accessToken));
      if (got.kind === 'forbidden') return null;
      if (!Array.isArray(got.body)) return unavailable();
      const batch = got.body as unknown[];
      rows.push(...batch);
      const ids = batch.flatMap((row) =>
        isPlainRecord(row) && isFiniteNumber(row.mail_id) ? [row.mail_id] : []
      );
      if (batch.length < 50 || ids.length === 0) break;
      before = Math.min(...ids);
    }
    return rows;
  }

  interface Batch {
    ids: number[];
    /** Known to hold an id ESI will not take, so it is split without being asked. */
    bad: boolean;
    /** The other half of the batch this one was split from. */
    twin?: Batch;
  }

  /**
   * A bulk POST, `BULK_IDS` at a time. ESI answers 404 for a whole batch when one id is bad, so
   * a refused batch is halved and each half tried, dropping the single ids ESI will not take.
   * At most `VETTING_BULK_MAX_MISSES` requests may fail that way: the largest batch is always
   * asked next, so when the allowance is spent only the small pieces still in doubt are dropped.
   */
  async function bulkAll(path: string, ids: readonly number[]): Promise<unknown[]> {
    const out: unknown[] = [];
    const queue: Batch[] = chunk([...new Set(ids)], BULK_IDS).map((batch) => ({
      ids: batch,
      bad: false,
    }));
    let misses = 0;
    const split = (batch: Batch) => {
      if (batch.ids.length === 1) return;
      const half = Math.ceil(batch.ids.length / 2);
      const first: Batch = { ids: batch.ids.slice(0, half), bad: false };
      const second: Batch = { ids: batch.ids.slice(half), bad: false, twin: first };
      first.twin = second;
      queue.push(first, second);
    };
    for (;;) {
      queue.sort((a, b) => b.ids.length - a.ids.length);
      const batch = queue.shift();
      if (!batch) break;
      if (batch.bad) {
        split(batch);
        continue;
      }
      if (misses >= VETTING_BULK_MAX_MISSES) break;
      const got = await request(path, null, batch.ids);
      if (got.kind === 'ok') {
        if (Array.isArray(got.body)) out.push(...(got.body as unknown[]));
        // This half was fine, so the bad id is in the other: no request needed to learn that.
        if (batch.twin && queue.includes(batch.twin)) batch.twin.bad = true;
      } else if (got.kind === 'not-found') {
        misses += 1;
        split(batch);
      } else {
        return got.kind === 'backoff' ? backoff() : unavailable();
      }
    }
    return out;
  }

  return {
    async readCharacter(characterId, accessToken, scopes) {
      // One request at a time: `settle` throws on a 420/429 or a low budget, so nothing after
      // the request that met it is sent.
      const sheet = settle(await request(`/characters/${characterId}/`, null));
      const history = settle(await request(`/characters/${characterId}/corporationhistory/`, null));
      if (sheet.kind !== 'ok' || history.kind !== 'ok') return unavailable();
      const body = sheet.body;
      if (
        !isPlainRecord(body) ||
        typeof body.name !== 'string' ||
        !isFiniteNumber(body.corporation_id) ||
        typeof body.birthday !== 'string' ||
        !Array.isArray(history.body)
      ) {
        return unavailable();
      }

      const missing: VettingSource[] = [];
      /** Runs `read` when the token covers the source; a refusal marks it not shared. */
      async function shared<T>(source: VettingSource, read: () => Promise<T | null>) {
        const got = scopes.includes(SOURCE_SCOPE[source]) ? await read() : null;
        if (got === null) missing.push(source);
        return got;
      }
      const at = `/characters/${characterId}`;
      const wallet = await shared('wallet', () => paged(`${at}/wallet/journal/`, accessToken));
      const contacts = await shared('contact', () => paged(`${at}/contacts/`, accessToken));
      const mail = await shared('mail', () => mailHeaders(characterId, accessToken));
      const contracts = await shared('contract', () => paged(`${at}/contracts/`, accessToken));
      const skills = await shared('skills', async () => {
        const got = settle(await request(`${at}/skills/`, accessToken));
        if (got.kind === 'forbidden') return null;
        return skillsOf(got.body) ?? unavailable();
      });

      const dealings: VettingDealing[] = [
        ...walletDealings(characterId, wallet ?? []),
        ...contactDealings(contacts ?? []),
        ...mailDealings(characterId, mail ?? []),
        ...contractDealings(characterId, contracts ?? []),
      ];
      const order: VettingSource[] = ['wallet', 'contact', 'mail', 'contract', 'skills'];
      return {
        characterId,
        name: body.name,
        corporationId: body.corporation_id,
        birthday: body.birthday,
        skillPoints: skills?.skillPoints ?? null,
        history: historyOf(history.body as unknown[]),
        dealings: capDealings(dealings, VETTING_MAX_DEALINGS),
        skills: skills?.skills ?? [],
        missing: order.filter((source) => missing.includes(source)),
      };
    },

    async corporation(corporationId) {
      const got = await request(`/corporations/${corporationId}/`, null);
      if (got.kind === 'not-found') return null;
      if (got.kind === 'backoff') return backoff();
      if (got.kind !== 'ok' || !isPlainRecord(got.body)) return unavailable();
      const { name, ticker } = got.body;
      if (typeof name !== 'string' || typeof ticker !== 'string') return unavailable();
      return { name, ticker };
    },

    async names(ids) {
      const rows = await bulkAll('/universe/names/', ids);
      return rows.flatMap((row): VettingParty[] => {
        if (!isPlainRecord(row) || !isFiniteNumber(row.id) || typeof row.name !== 'string') {
          return [];
        }
        const category =
          row.category === 'character' ||
          row.category === 'corporation' ||
          row.category === 'alliance'
            ? row.category
            : 'other';
        return [{ id: row.id, name: row.name, category }];
      });
    },

    async affiliations(characterIds) {
      const rows = await bulkAll('/characters/affiliation/', characterIds);
      return rows.flatMap((row): VettingAffiliation[] =>
        isPlainRecord(row) && isFiniteNumber(row.character_id) && isFiniteNumber(row.corporation_id)
          ? [
              {
                characterId: row.character_id,
                corporationId: row.corporation_id,
                ...(isFiniteNumber(row.alliance_id) ? { allianceId: row.alliance_id } : {}),
              },
            ]
          : []
      );
    },

    async ids(names) {
      const found: VettingWatchEntry[] = [];
      for (const batch of chunk([...new Set(names)], BULK_NAMES)) {
        const got = await request('/universe/ids/', null, batch);
        if (got.kind === 'backoff') return backoff();
        if (got.kind !== 'ok' || !isPlainRecord(got.body)) return unavailable();
        const groups = [
          ['characters', 'character'],
          ['corporations', 'corporation'],
          ['alliances', 'alliance'],
        ] as const;
        for (const [key, category] of groups) {
          const rows = got.body[key];
          if (!Array.isArray(rows)) continue;
          for (const row of rows as unknown[]) {
            if (isPlainRecord(row) && isFiniteNumber(row.id) && typeof row.name === 'string') {
              found.push({ id: row.id, name: row.name, category });
            }
          }
        }
      }
      return found;
    },
  };
}
