import { beforeEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { ESI_BASE, ESI_COMPATIBILITY_DATE } from './esiClient.js';
import {
  VETTING_BACKOFF_MAX_MS,
  VETTING_BACKOFF_MS,
  VETTING_BULK_MAX_MISSES,
  esiVettingReader,
  resetVettingEsiBackoff,
} from './vettingEsi.js';
import { VETTING_SCOPES } from './vettingScopes.js';

const ME = 2_100_000_001;
const PAL = 2_100_000_002;

interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that answers from `route` and records what it was asked, and how many at once. */
function fakeFetch(route: (call: Call) => Answer | undefined) {
  const calls: Call[] = [];
  const seen = { active: 0, mostAtOnce: 0 };
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.active += 1;
    seen.mostAtOnce = Math.max(seen.mostAtOnce, seen.active);
    await Promise.resolve();
    seen.active -= 1;
    const call: Call = {
      path: String(url).replace(ESI_BASE, ''),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = route(call) ?? { status: 500 };
    return new Response(JSON.stringify(answer.body ?? null), {
      status: answer.status ?? 200,
      headers: answer.headers,
    });
  }) as typeof fetch;
  return { impl, calls, seen };
}

// A 420/429 holds every reader back for a while: no test inherits another's.
beforeEach(resetVettingEsiBackoff);

const sheet = { name: 'Me', corporation_id: 98000001, birthday: '2015-01-01T00:00:00Z' };
const history = [{ corporation_id: 98000001, record_id: 1, start_date: '2020-01-01T00:00:00Z' }];

function publicRoutes(call: Call): Answer | undefined {
  if (call.path === `/characters/${ME}/`) return { body: sheet };
  if (call.path === `/characters/${ME}/corporationhistory/`) return { body: history };
  return undefined;
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected a failure');
}

describe('esiVettingReader.readCharacter', () => {
  it('requests only the sources the token covers, and lists the rest as missing', async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === `/characters/${ME}/skills/`) {
        return { body: { total_sp: 9, skills: [{ skill_id: 3344, trained_skill_level: 1 }] } };
      }
      return publicRoutes(call);
    });
    const input = await esiVettingReader(impl).readCharacter(ME, 'tok', [
      'esi-skills.read_skills.v1',
    ]);
    expect(input).toEqual({
      characterId: ME,
      name: 'Me',
      corporationId: 98000001,
      birthday: '2015-01-01T00:00:00Z',
      skillPoints: 9,
      history: [{ corporationId: 98000001, startDate: '2020-01-01T00:00:00Z' }],
      dealings: [],
      skills: [{ id: 3344, level: 1 }],
      missing: ['wallet', 'contact', 'mail', 'contract'],
    });
    expect(calls.map((call) => call.path).sort()).toEqual([
      `/characters/${ME}/`,
      `/characters/${ME}/corporationhistory/`,
      `/characters/${ME}/skills/`,
    ]);
    for (const call of calls) {
      expect(call.headers['X-Compatibility-Date']).toBe(ESI_COMPATIBILITY_DATE);
      expect(call.headers['X-User-Agent']).toMatch(/Neocom Desk/);
    }
    // The token goes to the scoped read only.
    expect(calls.find((call) => call.path.endsWith('/skills/'))?.headers.Authorization).toBe(
      'Bearer tok'
    );
    expect(calls.find((call) => call.path === `/characters/${ME}/`)?.headers.Authorization).toBe(
      undefined
    );
  });

  it('walks pages and mail by last_mail_id, and counts a 403 as not shared', async () => {
    const mailPage = (from: number) =>
      Array.from({ length: 50 }, (_, i) => ({
        mail_id: from - i,
        from: PAL,
        subject: 'secret subject',
        timestamp: '2026-10-01T00:00:00Z',
        recipients: [{ recipient_id: ME, recipient_type: 'character' }],
      }));
    const { impl, calls, seen } = fakeFetch((call) => {
      if (call.path === `/characters/${ME}/wallet/journal/?page=1`) {
        return {
          headers: { 'X-Pages': '2' },
          body: [
            {
              first_party_id: ME,
              second_party_id: PAL,
              ref_type: 'player_donation',
              amount: -1,
              date: '2026-10-02T00:00:00Z',
            },
          ],
        };
      }
      if (call.path === `/characters/${ME}/wallet/journal/?page=2`) {
        return {
          body: [
            {
              first_party_id: PAL,
              second_party_id: ME,
              ref_type: 'player_donation',
              amount: 2,
              date: '2026-10-01T00:00:00Z',
            },
          ],
        };
      }
      if (call.path === `/characters/${ME}/mail/`) return { body: mailPage(1000) };
      if (call.path === `/characters/${ME}/mail/?last_mail_id=951`) {
        return { body: mailPage(950).slice(0, 3) };
      }
      if (call.path.startsWith(`/characters/${ME}/contacts/`)) return { status: 403 };
      if (call.path.startsWith(`/characters/${ME}/contracts/`)) return { body: [] };
      if (call.path === `/characters/${ME}/skills/`) return { status: 403 };
      return publicRoutes(call);
    });
    const input = await esiVettingReader(impl).readCharacter(ME, 'tok', VETTING_SCOPES);
    // One request at a time, in a fixed order.
    expect(seen.mostAtOnce).toBe(1);
    expect(calls.map((call) => call.path.replace(`/characters/${ME}`, ''))).toEqual([
      '/',
      '/corporationhistory/',
      '/wallet/journal/?page=1',
      '/wallet/journal/?page=2',
      '/contacts/?page=1',
      '/mail/',
      '/mail/?last_mail_id=951',
      '/contracts/?page=1',
      '/skills/',
    ]);
    expect(input.missing).toEqual(['contact', 'skills']);
    expect(input.skillPoints).toBeNull();
    expect(input.dealings.filter((d) => d.source === 'wallet').map((d) => d.amount)).toEqual([
      -1, 2,
    ]);
    expect(input.dealings.filter((d) => d.source === 'mail')).toHaveLength(53);
    expect(JSON.stringify(input)).not.toContain('secret subject');
    // Headers only: no mail is ever opened.
    expect(calls.some((call) => /\/mail\/\d+/.test(call.path))).toBe(false);
  });

  it('fails rather than report a source as not shared when ESI is down or limiting', async () => {
    const down = fakeFetch((call) =>
      call.path.includes('/skills/') ? { status: 502 } : publicRoutes(call)
    );
    expect(
      await reasonOf(
        esiVettingReader(down.impl).readCharacter(ME, 'tok', ['esi-skills.read_skills.v1'])
      )
    ).toBe('esi-error');

    const limited = fakeFetch((call) =>
      call.path.includes('/skills/') ? { status: 420 } : publicRoutes(call)
    );
    expect(
      await reasonOf(
        esiVettingReader(limited.impl).readCharacter(ME, 'tok', ['esi-skills.read_skills.v1'])
      )
    ).toBe('esi-backoff');
    resetVettingEsiBackoff();

    const dead = fakeFetch((call) =>
      call.path.includes('/skills/') ? { status: 401 } : publicRoutes(call)
    );
    expect(
      await reasonOf(
        esiVettingReader(dead.impl).readCharacter(ME, 'tok', ['esi-skills.read_skills.v1'])
      )
    ).toBe('esi-forbidden');
  });

  it('stops paging once ESI says the error budget is low', async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.path.startsWith(`/characters/${ME}/wallet/journal/`)) {
        return { headers: { 'X-Pages': '5', 'X-ESI-Error-Limit-Remain': '3' }, body: [] };
      }
      return publicRoutes(call);
    });
    expect(
      await reasonOf(
        esiVettingReader(impl).readCharacter(ME, 'tok', ['esi-wallet.read_character_wallet.v1'])
      )
    ).toBe('esi-backoff');
    expect(calls.filter((call) => call.path.includes('/wallet/'))).toHaveLength(1);
  });

  it('sends nothing more once a source is rate limited', async () => {
    const { impl, calls } = fakeFetch((call) =>
      call.path.includes('/wallet/') ? { status: 429 } : publicRoutes(call)
    );
    expect(await reasonOf(esiVettingReader(impl).readCharacter(ME, 'tok', VETTING_SCOPES))).toBe(
      'esi-backoff'
    );
    expect(calls.map((call) => call.path)).toEqual([
      `/characters/${ME}/`,
      `/characters/${ME}/corporationhistory/`,
      `/characters/${ME}/wallet/journal/?page=1`,
    ]);
  });

  it('does not ask for the history when the sheet is rate limited', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 420 }));
    expect(await reasonOf(esiVettingReader(impl).readCharacter(ME, 'tok', []))).toBe('esi-backoff');
    expect(calls).toHaveLength(1);
  });
});

describe('esiVettingReader backoff', () => {
  const T0 = Date.parse('2026-11-01T12:00:00Z');

  it('holds every reader back until Retry-After has passed', async () => {
    let now = T0;
    let limited = true;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path !== '/corporations/98000001/') return undefined;
      return limited
        ? { status: 429, headers: { 'Retry-After': '30' } }
        : { body: { name: 'Test Corp', ticker: 'TEST' } };
    });
    const reader = () => esiVettingReader(impl, () => now);
    expect(await reasonOf(reader().corporation(98000001))).toBe('esi-backoff');
    expect(calls).toHaveLength(1);

    // Another reader, as the next call makes: refused without a request.
    limited = false;
    now = T0 + 29_999;
    expect(await reasonOf(reader().corporation(98000001))).toBe('esi-backoff');
    expect(await reasonOf(reader().names([1]))).toBe('esi-backoff');
    expect(await reasonOf(reader().readCharacter(ME, 'tok', []))).toBe('esi-backoff');
    expect(calls).toHaveLength(1);

    now = T0 + 30_000;
    expect(await reader().corporation(98000001)).toEqual({ name: 'Test Corp', ticker: 'TEST' });
    expect(calls).toHaveLength(2);
  });

  it('waits the error window when a 420 names no time, and caps a long one', async () => {
    let now = T0;
    let answer: Answer = { status: 420 };
    const { impl, calls } = fakeFetch(() => answer);
    const reader = () => esiVettingReader(impl, () => now);
    expect(await reasonOf(reader().corporation(1))).toBe('esi-backoff');
    now = T0 + VETTING_BACKOFF_MS - 1;
    expect(await reasonOf(reader().corporation(1))).toBe('esi-backoff');
    expect(calls).toHaveLength(1);

    now = T0 + VETTING_BACKOFF_MS;
    answer = { status: 429, headers: { 'Retry-After': '86400' } };
    expect(await reasonOf(reader().corporation(1))).toBe('esi-backoff');
    expect(calls).toHaveLength(2);
    answer = { body: { name: 'A', ticker: 'B' } };
    now += VETTING_BACKOFF_MAX_MS - 1;
    expect(await reasonOf(reader().corporation(1))).toBe('esi-backoff');
    now += 1;
    expect(await reader().corporation(1)).toEqual({ name: 'A', ticker: 'B' });
    expect(calls).toHaveLength(3);
  });
});

describe('esiVettingReader lookups', () => {
  it('names ids, bisecting a batch ESI 404s to drop the one it cannot name', async () => {
    const BAD = 91;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path !== '/universe/names/') return undefined;
      const ids = call.body as number[];
      if (ids.includes(BAD)) return { status: 404 };
      return { body: ids.map((id) => ({ id, name: `N${id}`, category: 'character' })) };
    });
    const names = await esiVettingReader(impl).names([90, 91, 92, 93, 90]);
    expect(names.map((party) => party.id).sort()).toEqual([90, 92, 93]);
    expect(names.find((party) => party.id === 90)).toEqual({
      id: 90,
      name: 'N90',
      category: 'character',
    });
    expect(calls.every((call) => call.method === 'POST')).toBe(true);
    // [90..93] and [90, 91] are refused; 90 alone is fine, so 91 is not asked for.
    expect(calls.map((call) => call.body)).toEqual([[90, 91, 92, 93], [90, 91], [92, 93], [90]]);
  });

  /** A `/universe/names/` that 404s any batch holding one of `bad`. */
  function naming(bad: (id: number) => boolean) {
    const fake = fakeFetch((call) => {
      const ids = call.body as number[];
      if (ids.some(bad)) return { status: 404 };
      return { body: ids.map((id) => ({ id, name: `N${id}`, category: 'character' })) };
    });
    const misses = () => fake.calls.filter((call) => (call.body as number[]).some(bad)).length;
    return { ...fake, misses };
  }

  it('spends at most six 404s on one bad id, losing only the few ids still in doubt', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => 1000 + i);
    const { impl, misses } = naming((id) => id === 1000);
    const names = await esiVettingReader(impl).names(ids);
    expect(misses()).toBe(VETTING_BULK_MAX_MISSES);
    expect(names.some((party) => party.id === 1000)).toBe(false);
    expect(names.length).toBeGreaterThanOrEqual(2500 - 64);
    expect(new Set(names.map((party) => party.id)).size).toBe(names.length);
  });

  it('stops bisecting a batch full of bad ids after six 404s', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => 1000 + i);
    const { impl, calls, misses } = naming((id) => id % 2 === 1);
    expect(await esiVettingReader(impl).names(ids)).toEqual([]);
    expect(misses()).toBe(VETTING_BULK_MAX_MISSES);
    expect(calls).toHaveLength(VETTING_BULK_MAX_MISSES);
  });

  it('reads affiliations, a corporation, and ids by name', async () => {
    const { impl } = fakeFetch((call) => {
      if (call.path === '/characters/affiliation/') {
        return {
          body: [
            { character_id: PAL, corporation_id: 98000002, alliance_id: 99000001 },
            { character_id: ME, corporation_id: 98000001 },
          ],
        };
      }
      if (call.path === '/corporations/98000001/') {
        return { body: { name: 'Test Corp', ticker: 'TEST', ceo_id: 1 } };
      }
      if (call.path === '/corporations/98000404/') return { status: 404 };
      if (call.path === '/universe/ids/') {
        return {
          body: {
            characters: [{ id: PAL, name: 'Bad Name' }],
            corporations: [{ id: 98000002, name: 'Bad Name' }],
            systems: [{ id: 30000142, name: 'Jita' }],
          },
        };
      }
      return undefined;
    });
    const esi = esiVettingReader(impl);
    expect(await esi.affiliations([PAL, ME])).toEqual([
      { characterId: PAL, corporationId: 98000002, allianceId: 99000001 },
      { characterId: ME, corporationId: 98000001 },
    ]);
    expect(await esi.corporation(98000001)).toEqual({ name: 'Test Corp', ticker: 'TEST' });
    expect(await esi.corporation(98000404)).toBeNull();
    expect(await esi.ids(['Bad Name', 'Jita'])).toEqual([
      { id: PAL, name: 'Bad Name', category: 'character' },
      { id: 98000002, name: 'Bad Name', category: 'corporation' },
    ]);
  });
});
