import { describe, it, expect } from 'vitest';
import type { AppraisalItem } from '@/engine/market/appraisal';
import { appraisalSellListText, hasAppraisalSellList } from './appraisalSellListText';

const ITEMS: AppraisalItem[] = [
  { typeId: 2048, name: 'Damage Control II', quantity: 3, buy: 498_500, sell: 512_000 },
  { typeId: 999, name: 'Civilian Gatling Railgun', quantity: 4, buy: null, sell: 1_000 },
  // Nobody selling — no legal undercut price, so it drops out entirely.
  { typeId: 555, name: 'Unlisted Widget', quantity: 1, buy: 10, sell: null },
];

describe('appraisalSellListText', () => {
  it('lists one tab-separated name/quantity/price line per item with a seller', () => {
    expect(appraisalSellListText(ITEMS)).toBe(
      'Damage Control II\t3\t511900\nCivilian Gatling Railgun\t4\t999.90'
    );
  });

  it('leaves out an item nobody is selling', () => {
    const text = appraisalSellListText(ITEMS);
    expect(text).not.toContain('Unlisted Widget');
  });

  it('is empty with nothing to sell', () => {
    expect(appraisalSellListText([ITEMS[2]])).toBe('');
  });
});

describe('hasAppraisalSellList', () => {
  it('is true once at least one item has a seller to undercut', () => {
    expect(hasAppraisalSellList(ITEMS)).toBe(true);
  });

  it('is false when nobody is selling anything pasted', () => {
    expect(hasAppraisalSellList([ITEMS[2]])).toBe(false);
  });

  it('is false with nothing pasted', () => {
    expect(hasAppraisalSellList([])).toBe(false);
  });
});
