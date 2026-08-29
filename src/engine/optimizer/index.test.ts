import { describe, it, expect } from 'vitest';
import { bestAttributes, optimizeRemaps, suggestReorder } from '@/engine/optimizer';
import { placeRemaps } from '@/engine/optimizer/placeRemaps';

describe('optimizer index', () => {
  it('re-exports the optimizer modes under UI-facing names', () => {
    expect(optimizeRemaps).toBe(placeRemaps);
    expect(typeof suggestReorder).toBe('function');
    expect(typeof bestAttributes).toBe('function');
  });
});
