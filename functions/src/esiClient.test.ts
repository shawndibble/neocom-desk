import { describe, expect, it, vi } from 'vitest';
import { esiGet } from './esiClient.js';

const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
const f = (r: Response | Error) =>
  vi.fn(async () => {
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;

describe('esiGet', () => {
  it('returns ok with the body and budget flag', async () => {
    const r = await esiGet('https://x/', {
      fetchImpl: f(res(200, [1], { 'X-Ratelimit-Remaining': '1' })),
    });
    expect(r).toMatchObject({ kind: 'ok', body: [1], budgetLow: true });
  });

  it('classifies statuses', async () => {
    const kind = async (s: number) => (await esiGet('u', { fetchImpl: f(res(s)) })).kind;
    expect(await kind(401)).toBe('expired');
    expect(await kind(403)).toBe('forbidden');
    expect(await kind(404)).toBe('not-found');
    expect(await kind(420)).toBe('backoff');
    expect(await kind(429)).toBe('backoff');
    expect(await kind(500)).toBe('error');
    expect(await kind(304)).toBe('not-modified');
  });

  it('reads Retry-After on backoff', async () => {
    const r = await esiGet('u', { fetchImpl: f(res(429, {}, { 'Retry-After': '7' })) });
    expect(r).toMatchObject({ kind: 'backoff', retryAfterMs: 7000 });
  });

  it('carries the status on error', async () => {
    expect(await esiGet('u', { fetchImpl: f(res(503)) })).toMatchObject({
      kind: 'error',
      status: 503,
    });
  });

  it('turns a fetch rejection into error, not a throw', async () => {
    const r = await esiGet('u', { fetchImpl: f(new TypeError('network')) });
    expect(r).toEqual({ kind: 'error', status: null, budgetLow: false });
  });

  it('guards a non-JSON body to null', async () => {
    const r = await esiGet('u', { fetchImpl: f(new Response('<html>', { status: 200 })) });
    expect(r).toMatchObject({ kind: 'ok', body: null });
  });

  it('sends identification headers, token, ETag and POST body', async () => {
    const fetchImpl = f(res(200));
    await esiGet('u', { token: 't', ifNoneMatch: 'e', fetchImpl });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer t',
      'If-None-Match': 'e',
      'X-Compatibility-Date': expect.any(String),
    });
    const post = f(res(200));
    await esiGet('u', { body: [1], fetchImpl: post });
    const p = (post as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(p).toMatchObject({ method: 'POST', body: '[1]' });
  });
});
