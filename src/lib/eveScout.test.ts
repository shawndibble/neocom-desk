import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import fixture from './__fixtures__/eveScoutSignatures.json';
import {
  clearEveScoutCache,
  EVE_SCOUT_SIGNATURES_URL,
  loadTheraConnections,
  parseEveScoutSignatures,
} from './eveScout';

describe('parseEveScoutSignatures (recorded 2026-09-30 response)', () => {
  it('reads every wormhole in the recorded response', () => {
    expect(parseEveScoutSignatures(fixture)).toHaveLength(fixture.length);
  });

  it('maps the hub side and the exit side of a connection', () => {
    const dour = parseEveScoutSignatures(fixture).find((c) => c.id === '74709');
    expect(dour).toEqual({
      id: '74709',
      hub: 'turnur',
      hubSignature: 'BDT-638',
      exitSignature: 'WZB-228',
      exitSystemId: 30003807,
      exitSystemName: 'Dour',
      exitClass: 'ls',
      exitRegionName: 'Placid',
      wormholeType: 'N944',
      maxShipSize: 'capital',
      expiresAt: Date.parse('2026-09-30T13:20:08.000Z'),
    });
  });

  it('reads Thera as a hub and a wormhole-space exit class', () => {
    const j120704 = parseEveScoutSignatures(fixture).find((c) => c.id === '74721');
    expect(j120704?.hub).toBe('thera');
    expect(j120704?.exitClass).toBe('c2');
    expect(j120704?.maxShipSize).toBe('large');
  });

  it('drops malformed entries, non-wormholes and unknown hubs rather than guessing', () => {
    const [good] = fixture;
    const body = [
      good,
      null,
      'nope',
      { ...good, id: 'x1', signature_type: 'combat' },
      { ...good, id: 'x2', in_system_id: undefined },
      { ...good, id: 'x3', out_system_id: 30000142 },
      { ...good, id: 'x4', expires_at: 'not a date' },
    ];
    expect(parseEveScoutSignatures(body).map((c) => c.id)).toEqual(['74709']);
    expect(parseEveScoutSignatures({ not: 'an array' })).toEqual([]);
  });

  it('keeps a connection whose optional fields are missing or unrecognised', () => {
    const [good] = fixture;
    const [parsed] = parseEveScoutSignatures([
      {
        ...good,
        max_ship_size: 'enormous',
        wh_type: null,
        in_region_name: undefined,
        in_system_class: 7,
        in_signature: null,
      },
    ]);
    expect(parsed).toMatchObject({
      maxShipSize: null,
      wormholeType: null,
      exitRegionName: null,
      exitClass: null,
      exitSignature: null,
    });
  });
});

describe('loadTheraConnections', () => {
  let requests = 0;
  let status = 200;
  const server = setupServer(
    http.get(EVE_SCOUT_SIGNATURES_URL, () => {
      requests += 1;
      return status === 200 ? HttpResponse.json(fixture) : new HttpResponse(null, { status });
    })
  );
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    requests = 0;
    status = 200;
    clearEveScoutCache();
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('fetches once and serves the answer from memory for five minutes', async () => {
    const first = await loadTheraConnections(1_000_000);
    const second = await loadTheraConnections(1_000_000 + 4 * 60_000);
    expect(first.kind).toBe('ok');
    expect(second).toBe(first);
    expect(requests).toBe(1);
    await loadTheraConnections(1_000_000 + 5 * 60_000 + 1);
    expect(requests).toBe(2);
  });

  it('shares one request between callers asking at the same time', async () => {
    const [a, b] = await Promise.all([loadTheraConnections(0), loadTheraConnections(0)]);
    expect(a).toBe(b);
    expect(requests).toBe(1);
  });

  it('records when the list was fetched', async () => {
    const result = await loadTheraConnections(1_234_000);
    expect(result.kind === 'ok' && result.fetchedAt.getTime()).toBe(1_234_000);
  });

  it('answers unavailable on a failed request, and does not cache the failure', async () => {
    status = 503;
    expect(await loadTheraConnections(0)).toEqual({ kind: 'unavailable' });
    status = 200;
    expect((await loadTheraConnections(1)).kind).toBe('ok');
    expect(requests).toBe(2);
  });

  it('keeps the last good list when a refresh fails', async () => {
    const good = await loadTheraConnections(0);
    status = 503;
    expect(await loadTheraConnections(10 * 60_000)).toBe(good);
  });
});
