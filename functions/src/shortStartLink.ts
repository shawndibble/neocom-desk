/**
 * Short start links: `POST` or `GET` the same fields a Survey start link carries
 * (`place`, `placeId`, `payee`, `payeeId`, `rate`, `notes`) and get back a short
 * `/s/<id>` link that opens the start page with them filled in. For a script that
 * wants to put a clean link in an EVE calendar event or a chat, where the long
 * query string is unreadable.
 *
 * Stored as a `shares` doc of type `survey-start` holding the canonical query, for
 * 30 days (the `shares.expiresAt` TTL policy removes it). Only this function writes
 * one (the rules refuse any client create of that type); the page that opens it
 * (`/s/<id>`) re-validates the query as it does for a hand-written start link. The
 * id comes from the query itself, so asking again for the same link returns the
 * same short link and renews its 30 days, and a script can't fill the collection
 * by repeating a request. Pure apart from the injected store.
 */
import { createHash } from 'node:crypto';

export const SURVEY_START_SHARE_TYPE = 'survey-start';
export const START_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The caps a stored Survey has (`MAX_LOCATION_NAME`, `MAX_TAX_NAME`, `MAX_SURVEY_NOTES`). */
const MAX_PLACE = 120;
const MAX_PAYEE = 100;
const MAX_NOTES = 1000;

/**
 * `shares` ids: the app's alphabet and length. A copy of `src/engine/share/shareId.ts` (the
 * `functions` package compiles only its own `src`, so it can't import it); the `shares` rule
 * accepts `[2-9a-hj-kmnp-z]{6}`, so change the two together.
 */
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

/** The fields as one canonical query string (fixed order), or why they are refused. */
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

/** The id for a query, from its hash; a nonzero `attempt` is the next try after a collision. */
export function shortIdFor(search: string, attempt = 0): string {
  const digest = createHash('sha256').update(`${attempt}:${search}`).digest();
  let id = '';
  for (const byte of digest) {
    if (byte >= UNBIASED_LIMIT) continue;
    id += ALPHABET[byte % ALPHABET.length];
    if (id.length === ID_LENGTH) return id;
  }
  // 32 bytes hold more than six usable ones except by astronomical bad luck.
  return shortIdFor(search, attempt + 1000);
}

export interface ShortLinkStore {
  /**
   * Stores `search` under `id` for the TTL, unless that id already holds a live, different
   * link. Same link again renews its expiry. Atomic: two requests can't both take one id.
   */
  claim(id: string, search: string, now: number, expiresAt: number): Promise<'ok' | 'taken'>;
}

export interface ShortLinkResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function makeShortStartLink(
  input: unknown,
  store: ShortLinkStore,
  now: number,
  appUrl: string
): Promise<ShortLinkResponse> {
  const canonical = canonicalSearch(input);
  if (!canonical.ok) return { status: 400, body: { error: canonical.error } };
  const expiresAt = now + START_LINK_TTL_MS;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = shortIdFor(canonical.search, attempt);
    if ((await store.claim(id, canonical.search, now, expiresAt)) === 'ok') {
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
