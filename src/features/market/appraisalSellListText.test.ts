import { describe, it, expect } from 'vitest';
import type { AppraisalItem } from '@/engine/market/appraisal';
import { appraisalSellListText } from './appraisalSellListText';

const ITEMS: AppraisalItem[] = [
  { typeId: 2048, name: 'Damage Control II', quantity: 3, buy: 498_500, sell: 512_000 },
  { typeId: 999, name: 'Civilian Gatling Railgun', quantity: 4, buy: null, sell: 1_000 },
  // Nobody selling — no legal undercut price, so it drops out entirely.
  { typeId: 555, name: 'Unlisted Widget', quantity: 1, buy: 10, sell: null },
];

describe('appraisalSellListText', () => {
  it('lists one tab-separated name/price line per item with a seller, no quantity', () => {
    expect(appraisalSellListText(ITEMS)).toBe(
      'Damage Control II\t511900\nCivilian Gatling Railgun\t999.90'
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
