import { describe, expect, it, vi } from 'vitest';
import { handleRequest, MAX_BODY_BYTES } from './janiceProxy.mjs';

const ORIGIN = 'https://dev.neocomdesk.com';

function post(body, { origin = ORIGIN, method = 'POST' } = {}) {
  return new Request('https://proxy.example/', {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

const valid = { text: 'Tritanium 100', hub: 'jita', pricePercent: 90 };

function janiceOk(extra = {}) {
  return vi.fn(async () =>
    Response.json({ code: 'Gb7io5', items: [{ id: 1 }], failures: '', ...extra })
  );
}

describe('janice proxy', () => {
  it('answers the CORS preflight for an allowed origin', async () => {
    const res = await handleRequest(post(null, { method: 'OPTIONS' }), { JANICE_API_KEY: 'k' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('refuses an origin that is not ours', async () => {
    const fetchFn = janiceOk();
    const res = await handleRequest(
      post(valid, { origin: 'https://evil.example' }),
      { JANICE_API_KEY: 'k' },
      fetchFn
    );
    expect(res.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the pasted text, market and settings to Janice and returns the link', async () => {
    const fetchFn = janiceOk();
    const res = await handleRequest(post(valid), { JANICE_API_KEY: 'secret' }, fetchFn);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'Gb7io5', url: 'https://janice.e-351.com/a/Gb7io5' });
    const [url, init] = fetchFn.mock.calls[0];
    const u = new URL(url);
    expect(u.pathname).toBe('/api/rest/v2/appraisal');
    expect(u.searchParams.get('market')).toBe('2');
    expect(u.searchParams.get('pricing')).toBe('buy');
    expect(u.searchParams.get('pricingVariant')).toBe('immediate');
    expect(u.searchParams.get('pricePercentage')).toBe('0.9');
    expect(u.searchParams.get('persist')).toBe('true');
    expect(u.searchParams.get('designation')).toBe('appraisal');
    expect(u.searchParams.has('comment')).toBe(false);
    expect(init.body).toBe('Tritanium 100');
    expect(init.headers['X-ApiKey']).toBe('secret');
    expect(init.headers['Content-Type']).toBe('text/plain');
  });

  it('rejects a blank paste', async () => {
    const res = await handleRequest(
      post({ ...valid, text: '  \n ' }),
      { JANICE_API_KEY: 'k' },
      janiceOk()
    );
    expect(res.status).toBe(400);
  });

  it('rejects a body over the size cap', async () => {
    const res = await handleRequest(
      post({ ...valid, text: 'a'.repeat(MAX_BODY_BYTES + 1) }),
      { JANICE_API_KEY: 'k' },
      janiceOk()
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('too-large');
  });

  it('refuses an oversized body by its Content-Length before reading it', async () => {
    const req = post(valid);
    const big = new Request(req, {
      headers: { ...Object.fromEntries(req.headers), 'content-length': String(MAX_BODY_BYTES * 2) },
    });
    const res = await handleRequest(big, { JANICE_API_KEY: 'k' }, janiceOk());
    expect(res.status).toBe(413);
  });

  it('fails early when the API key secret is missing', async () => {
    const fetchFn = janiceOk();
    const res = await handleRequest(post(valid), {}, fetchFn);
    expect(res.status).toBe(500);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an unknown hub and an out-of-range percent', async () => {
    const env = { JANICE_API_KEY: 'k' };
    expect((await handleRequest(post({ ...valid, hub: 'nowhere' }), env, janiceOk())).status).toBe(
      400
    );
    expect(
      (await handleRequest(post({ ...valid, pricePercent: 5000 }), env, janiceOk())).status
    ).toBe(400);
  });

  it('reports a rate limit', async () => {
    const env = { JANICE_API_KEY: 'k', LIMITER: { limit: async () => ({ success: false }) } };
    const res = await handleRequest(post(valid), env, janiceOk());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate-limited');
  });

  it('reports Janice failing, and a paste Janice could not read', async () => {
    const env = { JANICE_API_KEY: 'k' };
    const down = vi.fn(async () => new Response('nope', { status: 500 }));
    expect((await handleRequest(post(valid), env, down)).status).toBe(502);
    const empty = janiceOk({ items: [] });
    const res = await handleRequest(post(valid), env, empty);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('nothing-parsed');
  });
});
