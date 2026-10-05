import { describe, it, expect } from 'vitest';
import type { PriceSource } from '@/engine/miningTax/priceBasis';
import { SOURCE_FILL, SOURCE_TAG_CLASS } from './priceSourceTone';

const SOURCES: PriceSource[] = ['saved', 'historical', 'average', 'live', 'none'];

/** `var(--color-text-dim)` → `text-dim`. */
function fillToken(fill: string): string {
  const match = /^var\(--color-([a-z-]+)\)$/.exec(fill);
  if (!match) throw new Error(`not a colour token: ${fill}`);
  return match[1];
}

describe('price-source tones (issue #2225)', () => {
  it.each(SOURCES.filter((s) => s !== 'none'))(
    "paints the %s bar in a token that source's tag already uses",
    (source) => {
      const token = fillToken(SOURCE_FILL[source]);
      const tagClasses = SOURCE_TAG_CLASS[source].split(' ');
      expect(tagClasses.includes(`text-${token}`)).toBe(true);
    }
  );

  it('keeps Saved neutral and never uses accent (clickable only)', () => {
    expect(SOURCE_FILL.saved).toBe('var(--color-text-dim)');
    expect(SOURCES.filter((s) => SOURCE_FILL[s].includes('accent'))).toEqual([]);
    expect(SOURCES.filter((s) => SOURCE_TAG_CLASS[s].includes('accent'))).toEqual([]);
  });

  it('keeps the No price tag text dim, not faint', () => {
    expect(SOURCE_TAG_CLASS.none).toBe('text-text-dim');
  });

  it('never gives No price the same fill as Saved', () => {
    expect(SOURCE_FILL.none).not.toBe(SOURCE_FILL.saved);
  });
});
