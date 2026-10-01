import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { kmValue, rangeLines } from './rangeText';

const t = i18n.t.bind(i18n);

describe('kmValue', () => {
  it('reads metres as km to one decimal', () => {
    expect(kmValue(62500)).toBe('62.5');
    expect(kmValue(2410)).toBe('2.4');
  });
});

describe('rangeLines', () => {
  it("reads a falloff the way the game's HUD tooltip does: optimal plus falloff", () => {
    expect(rangeLines(t, 2400, 6300)).toEqual([
      'Optimal range within 2.4 km',
      'Falloff range within 8.7 km',
    ]);
  });

  it('gives a single range where there is no falloff, as a missile has', () => {
    expect(rangeLines(t, 62500, 0)).toEqual(['Range within 62.5 km']);
  });
});
