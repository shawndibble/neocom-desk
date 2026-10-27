import { describe, expect, it } from 'vitest';
import { askToCopyPrefill, canAskToCopy, type AskToCopyOffer } from './askToCopy';

const offer = (over: Partial<AskToCopyOffer> = {}): AskToCopyOffer => ({
  source: 'community',
  typeId: 33078,
  runs: -1,
  memberUid: 'u-ann',
  communities: [{ id: 'c1', name: 'Alpha' }],
  ...over,
});

describe('canAskToCopy', () => {
  it('is true for a Shared BPO from a Community', () => {
    expect(canAskToCopy(offer(), new Set())).toBe(true);
  });

  it('is false for a copy (runs set), which the row already offers as "from <name>"', () => {
    expect(canAskToCopy(offer({ runs: 10 }), new Set())).toBe(false);
  });

  it('is false for a reaction formula, which cannot be copied', () => {
    expect(canAskToCopy(offer(), new Set([33078]))).toBe(false);
  });

  it('is false while the formulas are unknown, never assumed allowed', () => {
    expect(canAskToCopy(offer(), null)).toBe(false);
  });

  it('is false for any row that is not a Community Offer', () => {
    expect(canAskToCopy(offer({ source: 'market' }), new Set())).toBe(false);
  });

  it('is false with no Community to post to', () => {
    expect(canAskToCopy(offer({ communities: [] }), new Set())).toBe(false);
  });
});

describe('askToCopyPrefill', () => {
  it('is one BPC line of that blueprint, quantity 1, runs/ME/TE left empty', () => {
    expect(askToCopyPrefill(offer(), 'Rifter Blueprint')).toEqual({
      lines: [{ typeId: 33078, name: 'Rifter Blueprint', quantity: 1, kind: 'bpc' }],
    });
  });
});
