// The Janice proxy's request handling, kept apart from the Worker entry so
// vitest can run it. See README.md for why a Worker sits in front of Janice.

export const JANICE_ORIGIN = 'https://janice.e-351.com';
export const MAX_BODY_BYTES = 50 * 1024;
export const ALLOWED_ORIGINS = ['https://neocomdesk.com', 'https://dev.neocomdesk.com'];

/**
 * Janice market ids by Trade Hub id (GET /api/rest/v2/markets). Keep the keys
 * in step with TRADE_HUBS in src/market/hubs.ts; a Worker can't import from src.
 */
export const HUB_MARKETS = {
  jita: 2,
  amarr: 115,
  dodixie: 117,
  rens: 116,
  hek: 118,
};

const MAX_PRICE_PERCENT = 1000;

function respond(status, body, origin) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

const fail = (status, error, origin) => respond(status, { error }, origin);

export async function handleRequest(request, env, fetchFn = fetch) {
  const requestOrigin = request.headers.get('origin');
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null;

  if (request.method === 'OPTIONS') {
    if (!origin) return fail(403, 'forbidden', null);
    const res = respond(204, null, origin);
    res.headers.set('access-control-allow-methods', 'POST');
    res.headers.set('access-control-allow-headers', 'content-type');
    res.headers.set('access-control-max-age', '86400');
    return res;
  }
  if (!origin) return fail(403, 'forbidden', null);
  if (request.method !== 'POST') return fail(405, 'method-not-allowed', origin);

  if (env.LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return fail(429, 'rate-limited', origin);
  }

  // Refuse an oversized body before buffering it; the text is measured again below.
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES + 1024) {
    return fail(413, 'too-large', origin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return fail(400, 'bad-request', origin);
  }
  const { text, hub, pricePercent } = input ?? {};
  if (typeof text !== 'string' || text.trim() === '') return fail(400, 'bad-request', origin);
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, 'too-large', origin);
  const market = Object.hasOwn(HUB_MARKETS, hub) ? HUB_MARKETS[hub] : null;
  if (market === null) return fail(400, 'unsupported-hub', origin);
  if (
    typeof pricePercent !== 'number' ||
    !(pricePercent >= 0 && pricePercent <= MAX_PRICE_PERCENT)
  ) {
    return fail(400, 'bad-request', origin);
  }

  if (!env.JANICE_API_KEY) return fail(500, 'not-configured', origin);

  const url = new URL('/api/rest/v2/appraisal', JANICE_ORIGIN);
  url.search = new URLSearchParams({
    market: String(market),
    pricing: 'buy',
    pricingVariant: 'immediate',
    // Janice stores this as a label; it does not scale its own figures.
    pricePercentage: String(pricePercent / 100),
    persist: 'true',
    designation: 'appraisal',
    compactize: 'true',
  }).toString();

  let janice;
  try {
    janice = await fetchFn(url.toString(), {
      method: 'POST',
      headers: {
        'X-ApiKey': env.JANICE_API_KEY,
        'Content-Type': 'text/plain',
        'User-Agent': 'neocom-desk-janice-proxy',
      },
      body: text,
    });
  } catch {
    return fail(502, 'janice-failed', origin);
  }
  if (!janice.ok) return fail(502, 'janice-failed', origin);

  let appraisal;
  try {
    appraisal = await janice.json();
  } catch {
    return fail(502, 'janice-failed', origin);
  }
  const code = appraisal?.code;
  if (typeof code !== 'string' || !/^[A-Za-z0-9]+$/.test(code))
    return fail(502, 'janice-failed', origin);
  if (!Array.isArray(appraisal.items) || appraisal.items.length === 0) {
    return fail(422, 'nothing-parsed', origin);
  }
  return respond(200, { code, url: `${JANICE_ORIGIN}/a/${code}` }, origin);
}
