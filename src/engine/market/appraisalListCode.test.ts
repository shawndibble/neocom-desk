import { describe, expect, it } from 'vitest';
import {
  APPRAISAL_LIST_CODE_VERSION,
  MAX_APPRAISAL_LIST_CODE_LENGTH,
  decodeAppraisalList,
  encodeAppraisalList,
  normaliseAppraisalList,
} from './appraisalListCode';

const EFT = `[Rifter, My Rifter]
200mm AutoCannon I, Phased Plasma S
Damage Control II

Large Shield Extender II
Cargo Scanner → Ñandú

Warrior II x5`;

describe('normaliseAppraisalList', () => {
  it('trims trailing whitespace per line and drops blank lines', () => {
    expect(normaliseAppraisalList('Tritanium 5  \r\n\r\n  \nPyerite\t\n')).toBe(
      'Tritanium 5\nPyerite'
    );
  });
});

describe('appraisal list code', () => {
  it('round-trips multi-line EFT text with non-ASCII names', async () => {
    const encoded = await encodeAppraisalList(EFT);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.code.startsWith(`${APPRAISAL_LIST_CODE_VERSION}.`)).toBe(true);
    expect(encoded.code).toMatch(/^[A-Za-z0-9_.-]+$/);
    const decoded = await decodeAppraisalList(encoded.code);
    expect(decoded).toEqual({ ok: true, text: normaliseAppraisalList(EFT) });
  });

  it('rejects empty input', async () => {
    expect(await encodeAppraisalList('  \n \n')).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports too-large past the length cap without throwing', async () => {
    const noisy = Array.from({ length: 3000 }, (_, i) => `Item ${i * 7919 + 13} ${i ** 3}`).join(
      '\n'
    );
    const result = await encodeAppraisalList(noisy);
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects text whose raw size passes the decode cap, even if it compresses small', async () => {
    const result = await encodeAppraisalList(`${'Tritanium 1\n'.repeat(6000)}`);
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('keeps a 1,000-line list under the cap', async () => {
    const list = Array.from({ length: 1000 }, (_, i) => `Tritanium ${i + 1}`).join('\n');
    const result = await encodeAppraisalList(list);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code.length).toBeLessThanOrEqual(MAX_APPRAISAL_LIST_CODE_LENGTH);
  });

  it.each([
    ['empty', ''],
    ['no version', 'abc'],
    ['wrong version', '9.eJxLTEoGAAJNASc'],
    ['bad characters', '1.***'],
    ['not deflate', '1.AAAAAAAA'],
    ['truncated', '1.'],
  ])('returns a typed failure for %s, never throws', async (_name, code) => {
    expect(await decodeAppraisalList(code)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a truncated real code', async () => {
    const encoded = await encodeAppraisalList(EFT);
    if (!encoded.ok) throw new Error('encode failed');
    const cut = encoded.code.slice(0, encoded.code.length - 6);
    expect(await decodeAppraisalList(cut)).toMatchObject({ ok: false });
  });

  it('enforces the decompressed-size cap (decompression bomb)', async () => {
    const bomb = 'a'.repeat(300_000);
    const bytes = new TextEncoder().encode(bomb);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (const b of compressed) bin += String.fromCharCode(b);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(b64.length).toBeLessThan(MAX_APPRAISAL_LIST_CODE_LENGTH);
    expect(await decodeAppraisalList(`${APPRAISAL_LIST_CODE_VERSION}.${b64}`)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects an over-long code before inflating it', async () => {
    const code = `${APPRAISAL_LIST_CODE_VERSION}.${'A'.repeat(MAX_APPRAISAL_LIST_CODE_LENGTH + 1)}`;
    expect(await decodeAppraisalList(code)).toEqual({ ok: false, reason: 'invalid' });
  });
});
