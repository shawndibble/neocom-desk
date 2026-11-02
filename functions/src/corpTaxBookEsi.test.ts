import { describe, expect, it, vi } from 'vitest';
import { esiCorporationLookup, esiIdCategoryLookup, esiIdentityReader } from './corpTaxBookEsi.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('esiIdentityReader', () => {
  it('reads corporation, roles and CEO with ESI identification headers and the caller token', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      if (url.endsWith('/characters/7/')) return json({ corporation_id: 98000001 });
      if (url.endsWith('/characters/7/roles/')) return json({ roles: ['Accountant'] });
      return json({ ceo_id: 7 });
    });
    const identity = await esiIdentityReader(fetchMock as unknown as typeof fetch)(7, 'tok');
    expect(identity).toEqual({ corporationId: 98000001, ceoId: 7, roles: ['Accountant'] });
    expect(calls.map((c) => c.url).sort()).toEqual([
      'https://esi.evetech.net/latest/characters/7/',
      'https://esi.evetech.net/latest/characters/7/roles/',
      'https://esi.evetech.net/latest/corporations/98000001/',
    ]);
    for (const c of calls) {
      expect(c.headers['X-Compatibility-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.headers['X-User-Agent']).toMatch(/Neocom Desk/);
      expect(c.headers['X-User-Agent']).not.toMatch(/@/);
    }
    // The token only goes to the one endpoint that needs it.
    expect(calls.filter((c) => c.headers.Authorization).map((c) => c.url)).toEqual([
      'https://esi.evetech.net/latest/characters/7/roles/',
    ]);
  });

  it('maps ESI failures to callable errors', async () => {
    const reader = (status: number) =>
      esiIdentityReader((async () => json({}, status)) as unknown as typeof fetch)(7, 't');
    await expect(reader(403)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(reader(429)).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(reader(502)).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('esiIdCategoryLookup (#4621)', () => {
  it('posts the id to universe/names with ESI headers and returns its category', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json([{ id: 77, category: 'character', name: 'Someone' }]);
    });
    expect(await esiIdCategoryLookup(fetchMock as unknown as typeof fetch)(77)).toBe('character');
    expect(calls[0].url).toMatch(/\/universe\/names\/$/);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('[77]');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Compatibility-Date']).toBeTruthy();
    expect(headers['X-User-Agent']).toBeTruthy();
  });

  it('an id ESI does not know has no category', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'Ensure all IDs are valid' }, 404));
    expect(await esiIdCategoryLookup(fetchMock as unknown as typeof fetch)(5)).toBeUndefined();
  });

  it('ESI failing is an error, never a guess', async () => {
    const fetchMock = vi.fn(async () => json({}, 502));
    await expect(esiIdCategoryLookup(fetchMock as unknown as typeof fetch)(5)).rejects.toThrow();
  });
});

describe('esiCorporationLookup', () => {
  // GET /characters/{id}/ is cached by ESI for a day, so a Character that just moved corporation
  // still reads as the old one there; the bulk affiliation lookup is fresh.
  it('asks the affiliation endpoint, not the day-cached character page', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json([{ character_id: 7, corporation_id: 98000042 }]);
    });
    const corporationId = await esiCorporationLookup(fetchMock as unknown as typeof fetch)(7);
    expect(corporationId).toBe(98000042);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://esi.evetech.net/latest/characters/affiliation/');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual([7]);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-Compatibility-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(headers['X-User-Agent']).toMatch(/Neocom Desk/);
    expect(headers.Authorization).toBeUndefined();
  });

  it('an answer with no corporation for the Character is an error, never a guess', async () => {
    const fetchMock = vi.fn(async () => json([]));
    await expect(
      esiCorporationLookup(fetchMock as unknown as typeof fetch)(7)
    ).rejects.toMatchObject({
      details: { reason: 'esi-error' },
    });
  });

  it('maps ESI failures to callable errors', async () => {
    const limited = vi.fn(async () => json({}, 429));
    await expect(esiCorporationLookup(limited as unknown as typeof fetch)(7)).rejects.toMatchObject(
      {
        details: { reason: 'esi-backoff' },
      }
    );
    const down = vi.fn(async () => json({}, 503));
    await expect(esiCorporationLookup(down as unknown as typeof fetch)(7)).rejects.toMatchObject({
      details: { reason: 'esi-error' },
    });
  });
});
