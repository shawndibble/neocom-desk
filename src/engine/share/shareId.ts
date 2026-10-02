/**
 * The id a stored Share Link lives under — the `asdu80ew7` in
 * `/share/asdu80ew7`. Nine base-62 characters is ~5.4 bits each, ~53 bits in
 * all: unguessable enough for a week-long link to an appraisal, and short
 * enough to read aloud in fleet comms.
 *
 * Minted on the client, before the doc is written, so the URL is known up
 * front (the Share button copies it inside the click, before any await).
 * A collision is caught by Firestore rather than here: the `shares` rule only
 * allows `create`, so writing over a taken id is refused, not merged.
 */

export const SHARE_ID_LENGTH = 9;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Bytes at or past this would make the first `256 % 62` characters likelier than the rest. */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

const SHARE_ID_PATTERN = new RegExp(`^[0-9A-Za-z]{${SHARE_ID_LENGTH}}$`);

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
  return SHARE_ID_PATTERN.test(value);
}
