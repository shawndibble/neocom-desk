import { describe, expect, it, vi } from 'vitest';
import {
  ESTIMATE_TTL_MS,
  IMPORT_MIN_GAP_MS,
  MAX_PENDING_IMPORTS,
  MUTAMARKET_USER_AGENT,
  MutamarketBusyError,
  MutamarketInputError,
  MutamarketProxy,
  MutamarketUnavailableError,
  NO_ESTIMATE_TTL_MS,
  parseEstimateInput,
  parseModuleEnvelope,
} from './mutamarket.js';

const BCS = 49738;
const UNTRAINED = 47702;
const ITEM = 1056087009644;

const STATS = [
  { id: 1, type_id: BCS, name: 'Abyssal Ballistic Control System', data_count: 10, r2: 0.6 },
  { id: 2, type_id: UNTRAINED, name: 'Untrained', data_count: 0, r2: null },
];

function moduleBody(over: Record<string, unknown> = {}) {
  return {
    data: {
      id: ITEM,
      type: { id: BCS, name: 'Abyssal Ballistic Control System' },
      slug: `abyssal-ballistic-control-system-${ITEM}`,
      estimated_value: 282840604.66,
      estimated_value_updated_at: '2026-10-16 06:20:34.839067+00',
      mutated_attributes: [],
      ...over,
    },
  };
}

function json(status: number, body: unknown = { message: 'x' }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Route = (method: string, url: string) => Response | Promise<Response>;

function harness(route: Route) {
  let clock = 1_000_000;
  const calls: { method: string; url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: String(url), init: init ?? {} });
    if (String(url).endsWith('/estimator-statistics')) return json(200, STATS);
    return route(method, String(url));
  });
  const sleeps: number[] = [];
  const proxy = new MutamarketProxy({
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return {
    proxy,
    calls,
    sleeps,
    advance: (ms: number) => {
      clock += ms;
    },
    moduleCalls: () => calls.filter((c) => !c.url.endsWith('/estimator-statistics')),
  };
}

describe('parseEstimateInput', () => {
  it('accepts positive integer ids', () => {
    expect(parseEstimateInput({ typeId: BCS, itemId: ITEM })).toEqual({
      typeId: BCS,
      itemId: ITEM,
    });
  });

  it.each([
    null,
    'x',
    [],
    { typeId: '49738', itemId: ITEM },
    { typeId: BCS, itemId: 1.5 },
    { typeId: BCS, itemId: -1 },
    { typeId: 0, itemId: ITEM },
    { typeId: BCS },
    { typeId: BCS, itemId: '1/../../admin' },
  ])('rejects %j', (input) => {
    expect(() => parseEstimateInput(input)).toThrow(MutamarketInputError);
  });
});

describe('parseModuleEnvelope', () => {
  it('reads the estimate and builds the module page link', () => {
    expect(parseModuleEnvelope(moduleBody(), BCS)).toEqual({
      status: 'priced',
      value: 282840604.66,
      valueUpdatedAt: '2026-10-16 06:20:34.839067+00',
      url: `https://mutamarket.com/modules/abyssal-ballistic-control-system-${ITEM}`,
    });
  });

  it.each([null, 0, -5, Number.NaN, '123'])('treats estimated_value %j as no estimate', (v) => {
    expect(parseModuleEnvelope(moduleBody({ estimated_value: v }), BCS).status).toBe('no-estimate');
  });

  it('is unknown when the module is of another type', () => {
    expect(parseModuleEnvelope(moduleBody(), 12345)).toEqual({ status: 'unknown' });
  });

  it('drops a slug that is not a plain path segment', () => {
    const parsed = parseModuleEnvelope(moduleBody({ slug: '../evil' }), BCS);
    expect(parsed).toMatchObject({ status: 'priced', url: null });
  });
});

describe('MutamarketProxy', () => {
  it('GETs a known module with a contact User-Agent and never POSTs', async () => {
    const h = harness(() => json(200, moduleBody()));
    const result = await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    expect(result).toMatchObject({ status: 'priced', value: 282840604.66 });
    expect(h.moduleCalls()).toHaveLength(1);
    expect(h.moduleCalls()[0]).toMatchObject({
      method: 'GET',
      url: `https://mutamarket.com/api/modules/${ITEM}`,
    });
    const headers = h.moduleCalls()[0].init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(MUTAMARKET_USER_AGENT);
    expect(MUTAMARKET_USER_AGENT).toContain('github.com/shawndibble/neocom-desk');
  });

  it('POSTs an import only after a 404', async () => {
    const h = harness((method) => (method === 'GET' ? json(404) : json(200, moduleBody())));
    const result = await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    expect(result.status).toBe('priced');
    const post = h.moduleCalls().find((c) => c.method === 'POST');
    expect(post?.url).toBe('https://mutamarket.com/api/modules');
    expect(JSON.parse(String(post?.init.body))).toEqual({ type_id: BCS, item_id: ITEM });
  });

  it('serves a repeat from memory until the TTL lapses', async () => {
    const h = harness(() => json(200, moduleBody()));
    await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    expect(h.moduleCalls()).toHaveLength(1);
    h.advance(ESTIMATE_TTL_MS + 1);
    await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    expect(h.moduleCalls()).toHaveLength(2);
  });

  it('shares one lookup between concurrent asks for an item', async () => {
    const h = harness(() => json(200, moduleBody()));
    await Promise.all([
      h.proxy.estimate({ typeId: BCS, itemId: ITEM }),
      h.proxy.estimate({ typeId: BCS, itemId: ITEM }),
    ]);
    expect(h.moduleCalls()).toHaveLength(1);
  });

  it('makes no call for a type MutaMarket does not price', async () => {
    const h = harness(() => json(200, moduleBody()));
    expect(await h.proxy.estimate({ typeId: 587, itemId: ITEM })).toEqual({ status: 'unknown' });
    expect(h.moduleCalls()).toHaveLength(0);
  });

  it('does not import a module of an untrained type', async () => {
    const h = harness(() => json(404));
    const result = await h.proxy.estimate({ typeId: UNTRAINED, itemId: ITEM });
    expect(result).toEqual({ status: 'no-estimate', url: null });
    expect(h.moduleCalls().map((c) => c.method)).toEqual(['GET']);
  });

  it('caches a refused import so it is not retried', async () => {
    const h = harness((method) => (method === 'GET' ? json(404) : json(400)));
    expect(await h.proxy.estimate({ typeId: BCS, itemId: ITEM })).toEqual({ status: 'unknown' });
    expect(await h.proxy.estimate({ typeId: BCS, itemId: ITEM })).toEqual({ status: 'unknown' });
    expect(h.moduleCalls().filter((c) => c.method === 'POST')).toHaveLength(1);
    h.advance(NO_ESTIMATE_TTL_MS + 1);
    await h.proxy.estimate({ typeId: BCS, itemId: ITEM });
    expect(h.moduleCalls().filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('throws unavailable on a 5xx and caches nothing', async () => {
    let status = 503;
    const h = harness(() => (status === 503 ? json(503) : json(200, moduleBody())));
    await expect(h.proxy.estimate({ typeId: BCS, itemId: ITEM })).rejects.toThrow(
      MutamarketUnavailableError
    );
    status = 200;
    expect((await h.proxy.estimate({ typeId: BCS, itemId: ITEM })).status).toBe('priced');
  });

  it('throws unavailable when the network fails', async () => {
    const h = harness(() => {
      throw new TypeError('network down');
    });
    await expect(h.proxy.estimate({ typeId: BCS, itemId: ITEM })).rejects.toThrow(
      MutamarketUnavailableError
    );
  });

  it('spaces imports apart, one at a time', async () => {
    const h = harness((method, url) =>
      method === 'GET' ? json(404) : json(200, moduleBody({ id: Number(url.length), slug: 'x' }))
    );
    await Promise.all([
      h.proxy.estimate({ typeId: BCS, itemId: 1 }),
      h.proxy.estimate({ typeId: BCS, itemId: 2 }),
      h.proxy.estimate({ typeId: BCS, itemId: 3 }),
    ]);
    expect(h.moduleCalls().filter((c) => c.method === 'POST')).toHaveLength(3);
    expect(h.sleeps).toEqual([IMPORT_MIN_GAP_MS, IMPORT_MIN_GAP_MS]);
  });

  it('refuses imports past the queue cap', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness(async (method) => {
      if (method === 'GET') return json(404);
      await gate;
      return json(200, moduleBody());
    });
    const asks = Array.from({ length: MAX_PENDING_IMPORTS + 1 }, (_, i) =>
      h.proxy.estimate({ typeId: BCS, itemId: i + 1 }).catch((e: unknown) => e)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    const results = await Promise.all(asks);
    expect(results.filter((r) => r instanceof MutamarketBusyError)).toHaveLength(1);
  });
});
