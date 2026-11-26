import { createHash, timingSafeEqual } from 'node:crypto';

export const SURVEY_START_SHARE_TYPE = 'survey-start';
export const START_LINK_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const NEW_LINK_GAP_MS = 30_000;
export const SHORT_LINK_LIMITS = 'shortLinkLimits';
export const NEW_LINKS_PER_WINDOW = 30;
export const NEW_LINK_WINDOW_MS = 60 * 60 * 1000;

export interface CallerState {
  lastAt: number;
  windowStart: number;
  count: number;
}

export type LimitCheck =
  { ok: true; next: CallerState } | { ok: false; limitedFor: number; reason: 'gap' | 'hour' };

export function checkNewLink(state: CallerState | null, now: number): LimitCheck {
  const fresh = state === null || now - state.windowStart >= NEW_LINK_WINDOW_MS;
  const windowStart = fresh ? now : state.windowStart;
  const count = fresh ? 0 : state.count;
  if (state !== null && now - state.lastAt < NEW_LINK_GAP_MS) {
    return { ok: false, limitedFor: NEW_LINK_GAP_MS - (now - state.lastAt), reason: 'gap' };
  }
  if (count >= NEW_LINKS_PER_WINDOW) {
    return { ok: false, limitedFor: windowStart + NEW_LINK_WINDOW_MS - now, reason: 'hour' };
  }
  return { ok: true, next: { lastAt: now, windowStart, count: count + 1 } };
}

const MAX_PLACE = 120;
const MAX_PAYEE = 100;
const MAX_NOTES = 1000;

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const ID_LENGTH = 6;
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);
const MAX_ATTEMPTS = 5;

export type CanonicalResult = { ok: true; search: string } | { ok: false; error: string };

function text(value: unknown, max: number, name: string): string | null | { error: string } {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return { error: `${name} must be text` };
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) return { error: `${name} is longer than ${max} characters` };
  return trimmed;
}

function wholeId(value: unknown, name: string): string | null | { error: string } {
  if (value === undefined || value === null || value === '') return null;
  const asText = typeof value === 'number' ? String(value) : value;
  if (typeof asText !== 'string' || !/^[1-9][0-9]{0,15}$/.test(asText.trim())) {
    return { error: `${name} must be a whole number` };
  }
  const n = Number(asText.trim());
  return Number.isSafeInteger(n) ? String(n) : { error: `${name} must be a whole number` };
}

function rateOf(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (value === '' || !Number.isFinite(n) || n < 0 || n > 100) {
    return { error: 'rate must be a number from 0 to 100' };
  }
  return String(n);
}

export function canonicalSearch(input: unknown): CanonicalResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'send place, placeId, payee, payeeId, rate and/or notes' };
  }
  const body = input as Record<string, unknown>;
  const parts: [string, string | null | { error: string }][] = [
    ['place', text(body.place, MAX_PLACE, 'place')],
    ['placeId', wholeId(body.placeId, 'placeId')],
    ['payee', text(body.payee, MAX_PAYEE, 'payee')],
    ['payeeId', wholeId(body.payeeId, 'payeeId')],
    ['rate', rateOf(body.rate)],
    ['notes', text(body.notes, MAX_NOTES, 'notes')],
  ];
  const query = new URLSearchParams();
  for (const [name, value] of parts) {
    if (value !== null && typeof value === 'object') return { ok: false, error: value.error };
    if (value !== null) query.set(name, value);
  }
  const search = query.toString();
  return search === ''
    ? { ok: false, error: 'send place, placeId, payee, payeeId, rate and/or notes' }
    : { ok: true, search };
}

export function shortIdFor(search: string, attempt = 0): string {
  const digest = createHash('sha256').update(`${attempt}:${search}`).digest();
  let id = '';
  for (const byte of digest) {
    if (byte >= UNBIASED_LIMIT) continue;
    id += ALPHABET[byte % ALPHABET.length];
    if (id.length === ID_LENGTH) return id;
  }
  return shortIdFor(search, attempt + 1000);
}

export type ClaimResult = 'ok' | 'taken' | { limitedFor: number; reason: 'gap' | 'hour' };

export interface ShortLinkStore {
  claim(
    id: string,
    search: string,
    caller: string,
    now: number,
    expiresAt: number
  ): Promise<ClaimResult>;
}

export interface ShortLinkResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export function clientIp(forwardedFor: string | string[] | undefined, fallback?: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const last = header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .pop();
  return last ?? fallback ?? 'unknown';
}

export const PROXY_CLIENT_HEADER = 'x-short-link-client';
export const PROXY_SECRET_HEADER = 'x-short-link-proxy';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function callerAddress(request: {
  proxyClient: string | undefined;
  proxySecret: string | undefined;
  forwardedFor: string | string[] | undefined;
  ip: string | undefined;
  expectedSecret: string | undefined;
}): string {
  const { proxyClient, proxySecret, expectedSecret } = request;
  if (
    expectedSecret !== undefined &&
    expectedSecret !== '' &&
    proxySecret !== undefined &&
    proxyClient !== undefined &&
    proxyClient.trim() !== '' &&
    sameSecret(proxySecret, expectedSecret)
  ) {
    return proxyClient.trim();
  }
  return clientIp(request.forwardedFor, request.ip);
}

export function callerKey(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function makeShortStartLink(
  input: unknown,
  store: ShortLinkStore,
  caller: string,
  now: number,
  appUrl: string
): Promise<ShortLinkResponse> {
  const canonical = canonicalSearch(input);
  if (!canonical.ok) return { status: 400, body: { error: canonical.error } };
  const expiresAt = now + START_LINK_TTL_MS;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = shortIdFor(canonical.search, attempt);
    const claimed = await store.claim(id, canonical.search, caller, now, expiresAt);
    if (typeof claimed === 'object') {
      const retryAfterSeconds = Math.ceil(claimed.limitedFor / 1000);
      return {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
        body: {
          error:
            claimed.reason === 'gap'
              ? 'one new short link every 30 seconds'
              : `at most ${NEW_LINKS_PER_WINDOW} new short links an hour`,
          retryAfterSeconds,
        },
      };
    }
    if (claimed === 'ok') {
      return {
        status: 200,
        body: {
          id,
          path: `/s/${id}`,
          url: `${appUrl.replace(/\/$/, '')}/s/${id}`,
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    }
  }
  return { status: 503, body: { error: 'could not allocate a short link, try again' } };
}
