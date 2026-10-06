import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { quickWin } from '@/engine/pi/planAdvice';
import { quickWinLine } from './coloniesText';

const t = i18n.t.bind(i18n);

describe('quickWinLine', () => {
  const win = quickWin(
    1,
    {
      kind: 'spare-room',
      what: 'factories',
      productTypeId: 2389,
      factories: 1,
      routedFrom: [],
      needsRemoval: false,
    },
    100
  );
  it('names the product with no doubled verb, as a {product} slot for its link', () => {
    const line = quickWinLine(win, new Map([[2389, 'Coolant']]), t);
    expect(line.verb).toBe('add');
    expect(line.text).toBe('1 more factory making {product}.');
    expect(line.products).toEqual([{ typeId: 2389, name: 'Coolant' }]);
  });

  it('lists every restarted resource for the slot, in order', () => {
    const restart = quickWin(
      1,
      { kind: 'restart', reason: 'stopped', extractors: 2, resourceTypeIds: [2268, 2309] },
      100
    );
    const line = quickWinLine(
      restart,
      new Map([
        [2268, 'Aqueous Liquids'],
        [2309, 'Ionic Solutions'],
      ]),
      t
    );
    expect(line.text).toBe('Restart {product}: 2 extractors have stopped.');
    expect(line.products.map((p) => p.name)).toEqual(['Aqueous Liquids', 'Ionic Solutions']);
  });

  it('has no products for a win that names none', () => {
    const storage = quickWin(1, { kind: 'storage', hoursToFull: 5, haulHours: 24 }, 100);
    expect(quickWinLine(storage, new Map(), t).products).toEqual([]);
  });
});
