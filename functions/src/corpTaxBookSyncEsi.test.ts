import { describe, expect, it } from 'vitest';
import { MAX_PAGES, esiSyncReader } from './corpTaxBookSyncEsi.js';

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

describe('esiSyncReader', () => {
  it('walks X-Pages, sends the identification headers and the bearer token', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: new Headers(init.headers) });
      const page = Number(new URL(url).searchParams.get('page'));
      return json([{ observer_id: 100 + page }], { 'X-Pages': '3' });
    }) as unknown as typeof fetch;
    const read = await esiSyncReader(fetchImpl).observers(98000001, 'tok');
    expect(read).toMatchObject({ kind: 'ok', data: [101, 102, 103], truncated: false });
    expect(seen.map((s) => new URL(s.url).pathname)).toEqual(
      Array(3).fill('/latest/corporation/98000001/mining/observers/')
    );
    expect(seen[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(seen[0].headers.get('X-Compatibility-Date')).toBeTruthy();
    expect(seen[0].headers.get('X-User-Agent')).toMatch(/Neocom Desk/);
    expect(seen[0].headers.get('X-User-Agent')).not.toMatch(/@/);
  });

  it('says so when the page cap cut the read short', async () => {
    const fetchImpl = (async () =>
      json([{ id: 1 }], { 'X-Pages': String(MAX_PAGES + 5) })) as unknown as typeof fetch;
    const read = await esiSyncReader(fetchImpl).journal(1, 1, 'tok');
    expect(read).toMatchObject({ kind: 'ok', truncated: true });
  });

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [420, 'backoff'],
    [429, 'backoff'],
    [500, 'unavailable'],
    [404, 'unavailable'],
  ])('classifies a %i as %s', async (status, kind) => {
    const fetchImpl = (async () => json({}, {}, status)) as unknown as typeof fetch;
    const esi = esiSyncReader(fetchImpl);
    expect((await esi.ledger(1, 2, 'tok')).kind).toBe(kind);
    expect(esi.budgetLow()).toBe(kind === 'backoff');
  });

  it('treats a network error as unavailable and a structure ACL refusal as no answer, not a dead token', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await esiSyncReader(down).extractions(1, 'tok')).kind).toBe('unavailable');
    const acl = (async () => json({}, {}, 403)) as unknown as typeof fetch;
    expect((await esiSyncReader(acl).structureSystem(5, 'tok')).kind).toBe('unavailable');
  });

  it('flags a low shared budget from the rate-limit headers', async () => {
    const fetchImpl = (async () =>
      json([], { 'X-Ratelimit-Remaining': '1' })) as unknown as typeof fetch;
    const esi = esiSyncReader(fetchImpl);
    await esi.notifications(1, 'tok');
    expect(esi.budgetLow()).toBe(true);
  });

  it('keeps only well-formed notifications and system ids', async () => {
    const fetchImpl = (async (url: string) =>
      url.includes('notifications')
        ? json([
            { type: 'A', timestamp: 't', text: 'x' },
            { type: 3 },
            { type: 'B', timestamp: 't2' },
          ])
        : json({ solar_system_id: 30000142 })) as unknown as typeof fetch;
    const esi = esiSyncReader(fetchImpl);
    expect(await esi.notifications(1, 'tok')).toMatchObject({
      data: [
        { type: 'A', timestamp: 't', text: 'x' },
        { type: 'B', timestamp: 't2' },
      ],
    });
    expect(await esi.structureSystem(5, 'tok')).toMatchObject({ kind: 'ok', data: 30000142 });
  });
});
