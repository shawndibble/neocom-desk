import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { SPACE_KINDS } from '@/engine/space';
import { activeBrowserFilters, type BrowserFilterValue } from './useBrowserFilters';

const DEFAULTS: BrowserFilterValue = {
  jumps: 'any',
  sec: new Set(SPACE_KINDS),
  minQty: 0,
  npcOnly: false,
  hideBait: false,
};

const pills = (value: BrowserFilterValue, regionMode: boolean) =>
  activeBrowserFilters(value, regionMode, i18n.t).map((pill) => [pill.label, pill.value]);

describe('activeBrowserFilters', () => {
  it('is empty at the defaults', () => {
    expect(pills(DEFAULTS, true)).toEqual([]);
  });

  it('says each filter in a few words, the range first', () => {
    const value: BrowserFilterValue = {
      jumps: '5',
      sec: new Set(['highsec', 'lowsec']),
      minQty: 1000,
      npcOnly: true,
      hideBait: true,
    };
    expect(pills(value, false)).toEqual([
      ['Distance', 'Within 5 jumps'],
      ['Security', 'Highsec, Lowsec'],
      ['Min quantity', '≥ 1,000'],
      ['NPC stations only', undefined],
      ['Hide bait sells', undefined],
    ]);
  });

  it('leaves out Security and NPC stations on a one-station Hub book', () => {
    const value: BrowserFilterValue = { ...DEFAULTS, sec: new Set(['highsec']), npcOnly: true };
    expect(pills(value, false)).toEqual([]);
    expect(pills(value, true).map(([label]) => label)).toEqual(['Security', 'NPC stations only']);
  });

  it('clears each filter back to its default, leaving the rest', () => {
    const value: BrowserFilterValue = { ...DEFAULTS, jumps: '10', minQty: 5 };
    const [range, minQty] = activeBrowserFilters(value, false, i18n.t);
    expect(range.clear(value)).toEqual({ ...value, jumps: 'any' });
    expect(minQty.clear(value)).toEqual({ ...value, minQty: 0 });
  });
});
