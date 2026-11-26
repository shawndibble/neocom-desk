export const SHARE_ID_LENGTH = 6;

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

const SHARE_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${SHARE_ID_LENGTH}}$`);
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
