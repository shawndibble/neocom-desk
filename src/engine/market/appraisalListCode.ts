/**
 * The Appraisal list as one URL-safe string (#5403): `?list=<code>` on
 * `/market/appraisal`, so Back, a reload and a copied address restore what
 * was on screen. The code is the whole state — no server, no lookup table —
 * so it also works on another device.
 *
 * Same shape as a Fitting Share Code (`engine/fittings/fittingShare.ts`):
 * `<version>.<base64url(deflate-raw(text))>` through the platform
 * `CompressionStream`, no compression library. Decoding never throws and
 * bounds both the encoded and the decompressed size, so a crafted link
 * cannot be a decompression bomb.
 *
 * The raw paste text is kept (after a lossless tidy), not a parsed item list,
 * so an EFT fit stays a fit.
 */

export const APPRAISAL_LIST_CODE_VERSION = '1';

/**
 * Longest `list` value that gets written. About 6,000 characters keeps the
 * whole address well under the ~8 KB request-line limit common hosts and
 * proxies enforce on a reload. A longer list is simply not written: the
 * Appraisal works from memory as usual, and this is the one case Back will
 * not restore.
 */
export const MAX_APPRAISAL_LIST_CODE_LENGTH = 6000;

/** A legitimate list is a few tens of KB at most; this only bounds a bomb. */
const MAX_DECOMPRESSED_BYTES = 65536;

const BASE64URL_TOKEN = /^[A-Za-z0-9_-]+$/;

export type EncodeAppraisalListResult =
  { ok: true; code: string } | { ok: false; reason: 'empty' | 'too-large' | 'unsupported' };

export type DecodeAppraisalListResult =
  { ok: true; text: string } | { ok: false; reason: 'invalid' };

/** Trailing whitespace per line and blank lines go; what the list appraises does not change. */
export function normaliseAppraisalList(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Drains a stream; a `null` result means it errored or passed `maxBytes`. */
async function drain(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array | null {
  if (!BASE64URL_TOKEN.test(str)) return null;
  const padded = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(str.length / 4) * 4, '=');
  try {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function encodeAppraisalList(text: string): Promise<EncodeAppraisalListResult> {
  const normalised = normaliseAppraisalList(text);
  if (normalised === '') return { ok: false, reason: 'empty' };
  const bytes = new TextEncoder().encode(normalised);
  // Decoding caps the inflated size, so a code that could not be read back is not written.
  if (bytes.length > MAX_DECOMPRESSED_BYTES) return { ok: false, reason: 'too-large' };
  let compressed: Uint8Array | null;
  try {
    compressed = await drain(
      toStream(bytes).pipeThrough(
        new CompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>
      ),
      MAX_DECOMPRESSED_BYTES
    );
  } catch {
    compressed = null;
  }
  if (compressed === null) return { ok: false, reason: 'unsupported' };
  const code = `${APPRAISAL_LIST_CODE_VERSION}.${base64urlEncode(compressed)}`;
  if (code.length > MAX_APPRAISAL_LIST_CODE_LENGTH) return { ok: false, reason: 'too-large' };
  return { ok: true, code };
}

export async function decodeAppraisalList(code: string): Promise<DecodeAppraisalListResult> {
  const invalid = { ok: false, reason: 'invalid' } as const;
  if (code.length > MAX_APPRAISAL_LIST_CODE_LENGTH) return invalid;
  const dot = code.indexOf('.');
  if (dot < 0 || code.slice(0, dot) !== APPRAISAL_LIST_CODE_VERSION) return invalid;
  const compressed = base64urlDecode(code.slice(dot + 1));
  if (compressed === null || compressed.length === 0) return invalid;
  let bytes: Uint8Array | null;
  try {
    bytes = await drain(
      toStream(compressed).pipeThrough(
        new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>
      ),
      MAX_DECOMPRESSED_BYTES
    );
  } catch {
    // No `deflate-raw` stream support: treated like any unreadable code.
    return invalid;
  }
  if (bytes === null) return invalid;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.trim() === '' ? invalid : { ok: true, text };
  } catch {
    return invalid;
  }
}
