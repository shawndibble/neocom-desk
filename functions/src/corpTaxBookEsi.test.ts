import { describe, expect, it, vi } from 'vitest';
import { esiIdentityReader } from './corpTaxBookEsi.js';

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
