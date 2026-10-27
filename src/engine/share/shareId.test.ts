import { describe, expect, it } from 'vitest';
import { generateShareId, isShareId, SHARE_ID_LENGTH } from './shareId';

/** A byte source that replays a fixed sequence, so an id is predictable. */
function bytes(...values: number[]) {
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = values[i % values.length];
    return out;
  };
}

describe('generateShareId', () => {
  it('is SHARE_ID_LENGTH easy-to-read lowercase characters', () => {
    const id = generateShareId();
    expect(id).toHaveLength(SHARE_ID_LENGTH);
    expect(id).toMatch(/^[2-9a-hj-kmnp-z]+$/);
    expect(id).not.toMatch(/[01ilo]/);
  });

  it('maps bytes onto the alphabet in order', () => {
    expect(generateShareId(bytes(0, 1, 6, 7, 30))).toBe('2389z2');
  });

  it('rejects bytes that would bias the alphabet rather than wrapping them', () => {
    // 248..255 sit past the last whole multiple of 31 (8 × 31 = 248); taking
    // them mod 31 would make 0–7 likelier than the rest.
    let call = 0;
    const source = (length: number) => {
      call++;
      return new Uint8Array(length).fill(call === 1 ? 255 : 5);
    };
    expect(generateShareId(source)).toBe('7'.repeat(SHARE_ID_LENGTH));
  });

  it('does not repeat across many draws', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateShareId()));
    expect(ids.size).toBe(1000);
  });
});

describe('isShareId', () => {
  it('accepts a generated id', () => {
    expect(isShareId(generateShareId())).toBe(true);
  });

  it('still accepts a nine-character id minted before the short key', () => {
    expect(isShareId('abc123XYZ')).toBe(true);
  });

  it('rejects the wrong length and characters outside the alphabet', () => {
    expect(isShareId('abc')).toBe(false);
    expect(isShareId('abcdefg!')).toBe(false);
    expect(isShareId('abcdefgh')).toBe(false);
    expect(isShareId('abcdef0')).toBe(false);
    expect(isShareId('abcdei')).toBe(false);
    expect(isShareId('')).toBe(false);
  });
});
