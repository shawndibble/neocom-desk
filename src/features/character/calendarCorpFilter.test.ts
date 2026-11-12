import { describe, expect, it } from 'vitest';
import { activeCorpFilter } from './calendarCorpFilter';

const MAIN = { id: 1, name: 'Main Corp', ticker: 'MAIN' };
const HOLD = { id: 2, name: 'Holding Two', ticker: 'HOLD2' };

describe('activeCorpFilter', () => {
  it('keeps All and Hide whatever is readable', () => {
    expect(activeCorpFilter('all', [])).toBe('all');
    expect(activeCorpFilter('none', [MAIN])).toBe('none');
  });

  it('keeps a saved corporation that is one of several', () => {
    expect(activeCorpFilter(2, [MAIN, HOLD])).toBe(2);
  });

  it('falls back to All for a corporation that is no longer readable', () => {
    expect(activeCorpFilter(3, [MAIN, HOLD])).toBe('all');
  });

  it('falls back to All when the saved corporation is the only one left', () => {
    expect(activeCorpFilter(2, [HOLD])).toBe('all');
  });
});
