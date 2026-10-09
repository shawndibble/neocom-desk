/**
 * The key a stored Share Link lives under — the `k7m2xq` in `/s/k7m2xq`.
 * Six characters from a 31-letter alphabet with nothing easily misread
 * (no `0/o`, `1/l/i`) and no capitals, so it can be read aloud in fleet comms
 * or typed from a screenshot. 31^6 is ~30 bits (about 887 million keys): enough that a week-long link
 * can't be stumbled on, since `shares` can only be read by id, never listed.
 *
 * Minted on the client, before the doc is written, so the URL is known up
 * front (the Share button copies it inside the click, before any await).
 * A collision is caught by Firestore rather than here: the `shares` rule only
 * allows `create`, so writing over a taken id is refused, not merged.
 *
 * Links made before the short key were nine base-62 characters under
 * `/share/<id>`; they live a week at most, but until then `isShareId` still
 * accepts them (and `firestore.rules` still serves them).
 */

export const SHARE_ID_LENGTH = 6;

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
/** Bytes at or past this would make the first `256 % 31` characters likelier than the rest. */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

const SHARE_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${SHARE_ID_LENGTH}}$`);
/** The pre-short-key id: nine characters, mixed case, digits included. */
const LEGACY_SHARE_ID_PATTERN = /^[0-9A-Za-z]{9}$/;

export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function generateShareId(randomBytes: RandomBytes = cryptoBytes): string {
  let id = '';
  while (id.length < SHARE_ID_LENGTH) {
    for (const byte of randomBytes(SHARE_ID_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === SHARE_ID_LENGTH) break;
    }
  }
  return id;
}

export function isShareId(value: string): boolean {
  return SHARE_ID_PATTERN.test(value) || LEGACY_SHARE_ID_PATTERN.test(value);
}
