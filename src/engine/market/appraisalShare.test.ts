import { describe, it, expect } from 'vitest';
import { encodeAppraisalShare, decodeAppraisalShare, MAX_SHARE_ITEMS } from './appraisalShare';

const baseItems = [
  { typeId: 34, quantity: 124_500 },
  { typeId: 12_345, quantity: 3 },
];

describe('encodeAppraisalShare', () => {
  it('round-trips hub, percent, timestamp and items through decode', () => {
    const encoded = encodeAppraisalShare({
      hub: 'jita',
      pricePercent: 90,
      generatedAt: 1_757_000_000,
      items: baseItems,
    });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeAppraisalShare(encoded.payload);
    expect(decoded).toEqual({
      ok: true,
      value: {
        hub: 'jita',
        pricePercent: 90,
        generatedAt: 1_757_000_000,
        items: baseItems,
      },
    });
  });

  it('round-trips a fractional price percent', () => {
    const encoded = encodeAppraisalShare({
      hub: 'amarr',
      pricePercent: 97.5,
      generatedAt: 1,
      items: baseItems,
    });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeAppraisalShare(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.pricePercent).toBe(97.5);
  });

  it('rejects an empty item list rather than producing a link to nothing', () => {
    expect(
      encodeAppraisalShare({ hub: 'jita', pricePercent: 100, generatedAt: 1, items: [] })
    ).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a list over the byte-budget item ceiling instead of producing a broken link', () => {
    const items = Array.from({ length: MAX_SHARE_ITEMS + 1 }, (_, i) => ({
      typeId: i + 1,
      quantity: 1,
    }));
    expect(encodeAppraisalShare({ hub: 'jita', pricePercent: 100, generatedAt: 1, items })).toEqual(
      { ok: false, reason: 'too-large' }
    );
  });

  it('allows exactly the ceiling', () => {
    const items = Array.from({ length: MAX_SHARE_ITEMS }, (_, i) => ({
      typeId: i + 1,
      quantity: 1,
    }));
    const encoded = encodeAppraisalShare({ hub: 'jita', pricePercent: 100, generatedAt: 1, items });
    expect(encoded.ok).toBe(true);
  });
});

describe('decodeAppraisalShare', () => {
  it('rejects garbage input rather than throwing', () => {
    expect(decodeAppraisalShare('not-a-real-payload')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeAppraisalShare('')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a payload with no item pairs', () => {
    expect(decodeAppraisalShare('jita:100:1:')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a malformed pair', () => {
    expect(decodeAppraisalShare('jita:100:1:notapair')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a non-finite price percent', () => {
    expect(decodeAppraisalShare('jita:notanumber:1:1-1')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a price percent outside the field bounds', () => {
    expect(decodeAppraisalShare('jita:-5:1:1-1')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeAppraisalShare('jita:1001:1:1-1')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a non-integer or non-positive typeId or quantity', () => {
    expect(decodeAppraisalShare('jita:100:1:0-1')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeAppraisalShare('jita:100:1:1-0')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token with trailing garbage rather than silently truncating it', () => {
    // parseInt('5.5', 36) is 5, not NaN — a lone regex-free parseInt would
    // have let this decode to typeId 5 instead of rejecting the payload.
    expect(decodeAppraisalShare('jita:100:1:5.5-1')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeAppraisalShare('jita:100:1:1-5.5')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeAppraisalShare('jita:100:5.5:1-1')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a payload carrying more items than the ceiling, forged or not', () => {
    const pairs = Array.from(
      { length: MAX_SHARE_ITEMS + 1 },
      (_, i) => `${(i + 1).toString(36)}-1`
    ).join('_');
    expect(decodeAppraisalShare(`jita:100:1:${pairs}`).ok).toBe(false);
  });
});
