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
      source: 'local',
      routedFrom: [],
      needsRemoval: false,
    },
    100
  );
  it('names the product with no doubled verb', () => {
    const line = quickWinLine(win, new Map([[2389, 'Coolant']]), t);
    expect(line.verb).toBe('add');
    expect(line.text).toBe('1 more factory making Coolant.');
  });
});
