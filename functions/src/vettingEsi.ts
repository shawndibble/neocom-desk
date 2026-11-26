import { fail } from './actorAuth.js';
import { chunk } from './chunk.js';
import { ESI_BASE, esiGet } from './esiClient.js';
import { isFiniteNumber, isPlainRecord } from './guards.js';
import type {
  VettingDealing,
  VettingParty,
  VettingSource,
  VettingWatchEntry,
} from './vettingEngine.js';
import {
  rawContactRows,
  rawContractRows,
  rawHistoryRows,
  rawMailRows,
  rawSkillRows,
  rawWalletRows,
} from './vettingRawRows.js';
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
import { VETTING_MAX_DEALINGS, type VettingRead } from './vettingTypes.js';

export const VETTING_MAX_PAGES = 20;
export const VETTING_MAIL_PAGES = 4;
const TIMEOUT_MS = 20_000;
const BULK_IDS = 1000;
const BULK_NAMES = 500;
export const VETTING_BULK_MAX_MISSES = 6;
export const VETTING_BACKOFF_MS = 60_000;
export const VETTING_BACKOFF_MAX_MS = 15 * 60_000;

let notBefore = 0;

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
  readCharacter(
    characterId: number,
    accessToken: string,
    scopes: readonly string[]
  ): Promise<VettingRead>;
  corporation(corporationId: number): Promise<{ name: string; ticker: string } | null>;
  names(ids: readonly number[]): Promise<VettingParty[]>;
  affiliations(characterIds: readonly number[]): Promise<VettingAffiliation[]>;
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
    const got = await esiGet(`${ESI_BASE}${path}`, {
      token: accessToken,
      timeoutMs: TIMEOUT_MS,
      fetchImpl,
      body,
    });
    if (got.budgetLow) low = true;
    switch (got.kind) {
      case 'backoff': {
        low = true;
        const wait = got.retryAfterMs ?? VETTING_BACKOFF_MS;
        notBefore = Math.max(notBefore, now() + Math.min(wait, VETTING_BACKOFF_MAX_MS));
        return { kind: 'backoff' };
      }
      case 'forbidden':
      case 'expired':
      case 'not-found':
        return { kind: got.kind };
      case 'error':
      case 'not-modified':
        return { kind: 'unavailable' };
      case 'ok':
        break;
    }
    if (got.body === null) return { kind: 'unavailable' };
    const pages = Number(got.headers.get('X-Pages'));
    return {
      kind: 'ok',
      body: got.body,
      pages: Number.isSafeInteger(pages) && pages > 1 ? pages : 1,
    };
  }

  function settle(got: Got): { kind: 'ok'; body: unknown; pages: number } | { kind: 'forbidden' } {
    if (got.kind === 'ok' || got.kind === 'forbidden') return got;
    if (got.kind === 'expired') {
      return fail('permission-denied', 'ESI refused this Character', 'esi-forbidden');
    }
    return got.kind === 'backoff' ? backoff() : unavailable();
  }

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
    bad: boolean;
    twin?: Batch;
  }

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
      let skillsBody: unknown = null;
      const skills = await shared('skills', async () => {
        const got = settle(await request(`${at}/skills/`, accessToken));
        if (got.kind === 'forbidden') return null;
        skillsBody = got.body;
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
        input: {
          characterId,
          name: body.name,
          corporationId: body.corporation_id,
          birthday: body.birthday,
          skillPoints: skills?.skillPoints ?? null,
          history: historyOf(history.body as unknown[]),
          dealings: capDealings(dealings, VETTING_MAX_DEALINGS),
          skills: skills?.skills ?? [],
          missing: order.filter((source) => missing.includes(source)),
        },
        raw: {
          wallet: rawWalletRows(characterId, wallet ?? []),
          contact: rawContactRows(characterId, contacts ?? []),
          mail: rawMailRows(characterId, mail ?? []),
          contract: rawContractRows(characterId, contracts ?? []),
          skills: rawSkillRows(characterId, skillsBody),
          history: rawHistoryRows(characterId, history.body as unknown[]),
        },
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
