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
  it.each(SOURCES)("paints the %s bar in a token that source's tag already uses", (source) => {
    const token = fillToken(SOURCE_FILL[source]);
    const tagClasses = SOURCE_TAG_CLASS[source].split(' ');
    expect(tagClasses.includes(`text-${token}`)).toBe(true);
  });

  it('keeps Saved neutral and gives accent only to Live', () => {
    expect(SOURCE_FILL.saved).toBe('var(--color-text-dim)');
    expect(SOURCE_FILL.live).toBe('var(--color-accent)');
    const accented = SOURCES.filter((s) => SOURCE_FILL[s].includes('accent'));
    expect(accented).toEqual(['live']);
  });

  it('never gives No price the same fill as Saved', () => {
    expect(SOURCE_FILL.none).not.toBe(SOURCE_FILL.saved);
  });
});
