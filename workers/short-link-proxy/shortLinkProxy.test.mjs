import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_HEADER,
  FUNCTION_URL,
  MAX_BODY_BYTES,
  PROXY_HEADER,
  handleRequest,
} from './shortLinkProxy.mjs';

const ENV = { PROXY_SECRET: 's3cret' };

const upstreamOk = () =>
  vi.fn(async () =>
    Response.json({ id: 'xk3p9q', path: '/s/xk3p9q' }, { headers: { 'retry-after': '20' } })
  );

function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://api.example${path}`, { method, body, headers });
}

describe('short link proxy', () => {
  it('serves only /short', async () => {
    const fetchFn = upstreamOk();
    const res = await handleRequest(req('/other'), ENV, fetchFn);
    expect(res.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('answers the CORS preflight for any origin without calling the function', async () => {
    const fetchFn = upstreamOk();
    const res = await handleRequest(req('/short', { method: 'OPTIONS' }), ENV, fetchFn);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses other methods', async () => {
    const res = await handleRequest(req('/short', { method: 'DELETE' }), ENV, upstreamOk());
    expect(res.status).toBe(405);
  });

  it('forwards a POST body and says who the caller is, signed with the secret', async () => {
    const fetchFn = upstreamOk();
    const res = await handleRequest(
      req('/short', {
        method: 'POST',
        body: '{"rate":5}',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      }),
      ENV,
      fetchFn
    );
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(FUNCTION_URL);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"rate":5}');
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(init.headers.get(CLIENT_HEADER)).toBe('203.0.113.9');
    expect(init.headers.get(PROXY_HEADER)).toBe('s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'xk3p9q', path: '/s/xk3p9q' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('forwards a GET query string and passes Retry-After and status back', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ error: 'slow down' }, { status: 429, headers: { 'retry-after': '20' } })
    );
    const res = await handleRequest(req('/short?placeId=7&rate=5'), ENV, fetchFn);
    expect(fetchFn.mock.calls[0][0]).toBe(`${FUNCTION_URL}?placeId=7&rate=5`);
    expect(fetchFn.mock.calls[0][1].body).toBeUndefined();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('20');
  });

  it('drops a caller-supplied client or secret header', async () => {
    const fetchFn = upstreamOk();
    await handleRequest(
      req('/short', {
        headers: {
          [CLIENT_HEADER]: '6.6.6.6',
          [PROXY_HEADER]: 'guess',
          'cf-connecting-ip': '1.1.1.1',
        },
      }),
      ENV,
      fetchFn
    );
    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers.get(CLIENT_HEADER)).toBe('1.1.1.1');
    expect(headers.get(PROXY_HEADER)).toBe('s3cret');
  });

  it('refuses a body over the cap before calling the function', async () => {
    const fetchFn = upstreamOk();
    const res = await handleRequest(
      req('/short', { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1) }),
      ENV,
      fetchFn
    );
    expect(res.status).toBe(413);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('says so when the secret is not set, or the function cannot be reached', async () => {
    expect((await handleRequest(req('/short'), {}, upstreamOk())).status).toBe(500);
    const down = vi.fn(async () => {
      throw new Error('network');
    });
    expect((await handleRequest(req('/short'), ENV, down)).status).toBe(502);
  });
});
