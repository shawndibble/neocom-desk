// The short link proxy's request handling, kept apart from the Worker entry so
// vitest can run it. See README.md for why a Worker sits in front of the function.

/** The Firebase function this fronts (functions/src/shortStartLink.ts). */
export const FUNCTION_URL = 'https://us-central1-neocom-desk.cloudfunctions.net/shortStartLink';
/** The one path served; the function takes the same fields by GET query or POST body. */
export const SHORT_PATH = '/short';
/** A start link's fields are a few hundred bytes; the function itself caps each one. */
export const MAX_BODY_BYTES = 8 * 1024;

/** Sent to the function so it limits by the caller's address, not Cloudflare's. */
export const CLIENT_HEADER = 'x-short-link-client';
export const PROXY_HEADER = 'x-short-link-proxy';

// Public by design (a script has no origin): the function validates and limits.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
  });

/** The body as text, or null once it passes the cap (stopped while streaming, not buffered whole). */
async function readCapped(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

export async function handleRequest(request, env, fetchFn = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== SHORT_PATH) return json(404, { error: 'not found' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(405, { error: 'use GET or POST' }, { allow: 'GET, POST, OPTIONS' });
  }
  if (!env.PROXY_SECRET) return json(500, { error: 'not configured' });

  let body;
  if (request.method === 'POST') {
    body = await readCapped(request, MAX_BODY_BYTES);
    if (body === null) return json(413, { error: 'too large' });
  }

  // A fresh set of headers: whatever the caller sent under our two names is dropped,
  // so only this Worker can say who the caller is.
  const headers = new Headers();
  const type = request.headers.get('content-type');
  if (type) headers.set('content-type', type);
  headers.set(CLIENT_HEADER, request.headers.get('cf-connecting-ip') ?? '');
  headers.set(PROXY_HEADER, env.PROXY_SECRET);

  let upstream;
  try {
    upstream = await fetchFn(FUNCTION_URL + url.search, { method: request.method, headers, body });
  } catch {
    return json(502, { error: 'could not reach the short link service' });
  }

  const reply = new Headers(CORS);
  const replyType = upstream.headers.get('content-type');
  if (replyType) reply.set('content-type', replyType);
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) reply.set('retry-after', retryAfter);
  return new Response(await upstream.text(), { status: upstream.status, headers: reply });
}
