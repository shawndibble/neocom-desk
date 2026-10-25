import { describe, expect, it, vi } from 'vitest';
import { fetchCharacterLocation, fetchIncursions, fetchRaidableSkyhooks } from './esiNearby.js';

const respond = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

function headersOf(mock: ReturnType<typeof respond>) {
  const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string> };
}

describe('fetchCharacterLocation', () => {
  it('sends ESI identification headers (no email) and the bearer token', async () => {
    const mock = respond(200, { solar_system_id: 30000142 });
    await fetchCharacterLocation(9, 'tok', mock as unknown as typeof fetch);
    const { url, headers } = headersOf(mock);
    expect(url).toBe('https://esi.evetech.net/characters/9/location');
    expect(headers['X-Compatibility-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(headers['X-User-Agent']).toBeTruthy();
    expect(headers['X-User-Agent']).not.toMatch(/@/);
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('classifies responses', async () => {
    expect(
      await fetchCharacterLocation(9, 't', respond(200, { solar_system_id: 5 }) as never)
    ).toEqual({
      kind: 'ok',
      solarSystemId: 5,
      budgetLow: false,
    });
    expect(
      await fetchCharacterLocation(
        9,
        't',
        respond(200, { solar_system_id: 5 }, { 'X-ESI-Error-Limit-Remain': '3' }) as never
      )
    ).toEqual({ kind: 'ok', solarSystemId: 5, budgetLow: true });
    expect(await fetchCharacterLocation(9, 't', respond(403) as never)).toEqual({
      kind: 'forbidden',
    });
    expect(
      await fetchCharacterLocation(9, 't', respond(429, {}, { 'Retry-After': '12' }) as never)
    ).toEqual({ kind: 'backoff', retryAfterMs: 12_000 });
    expect(await fetchCharacterLocation(9, 't', respond(503) as never)).toEqual({
      kind: 'error',
      status: 503,
    });
    expect(await fetchCharacterLocation(9, 't', respond(200, { nope: 1 }) as never)).toEqual({
      kind: 'error',
      status: 200,
    });
  });
});

describe('public lists', () => {
  it('reads the Incursions, keeping only well-formed entries', async () => {
    const good = { constellation_id: 1, staging_solar_system_id: 2, state: 'established' };
    const mock = respond(200, [good, { constellation_id: 'x' }]);
    expect(await fetchIncursions(mock as unknown as typeof fetch)).toEqual({
      kind: 'ok',
      value: [good],
      budgetLow: false,
    });
    const { url, headers } = headersOf(mock);
    expect(url).toBe('https://esi.evetech.net/incursions');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-User-Agent']).not.toMatch(/@/);
  });

  it('reads the raidable skyhooks list', async () => {
    const hook = {
      solar_system_id: 1,
      planet_id: 2,
      theft_vulnerability: { start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z' },
    };
    const mock = respond(200, { skyhooks: [hook, { planet_id: 'x' }] });
    expect(await fetchRaidableSkyhooks(mock as unknown as typeof fetch)).toEqual({
      kind: 'ok',
      value: [hook],
      budgetLow: false,
    });
    expect(headersOf(mock).url).toBe('https://esi.evetech.net/skyhooks/raidable');
  });

  it('reports a failure or the budget instead of a list', async () => {
    expect(await fetchIncursions(respond(500) as never)).toEqual({ kind: 'error', status: 500 });
    expect(await fetchRaidableSkyhooks(respond(420) as never)).toEqual({
      kind: 'backoff',
      retryAfterMs: null,
    });
    expect(await fetchRaidableSkyhooks(respond(200, [1]) as never)).toEqual({
      kind: 'error',
      status: 200,
    });
  });
});
