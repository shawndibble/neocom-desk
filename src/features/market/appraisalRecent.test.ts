import { describe, expect, it } from 'vitest';
import { addRecent, MAX_RECENT, recentLabel, type RecentAppraisal } from './appraisalRecent';

const NOW = 1_000_000;

describe('addRecent', () => {
  it('puts the newest first', () => {
    const list = addRecent(addRecent([], 'Tritanium 5', NOW), 'Pyerite 5', NOW + 1);
    expect(list.map((r) => r.text)).toEqual(['Pyerite 5', 'Tritanium 5']);
  });

  it('caps the list at five', () => {
    let list: RecentAppraisal[] = [];
    for (let i = 0; i < 8; i++) list = addRecent(list, `Tritanium ${i + 1}`, NOW + i);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]?.text).toBe('Tritanium 8');
  });

  it('dedupes by text, moving it to the front with a fresh time', () => {
    let list = addRecent([], 'A 1', NOW);
    list = addRecent(list, 'B 1', NOW + 1);
    list = addRecent(list, 'A 1', NOW + 2);
    expect(list.map((r) => r.text)).toEqual(['A 1', 'B 1']);
    expect(list[0]?.savedAt).toBe(NOW + 2);
  });

  it('ignores blank text', () => {
    expect(addRecent([], '  \n', NOW)).toEqual([]);
  });
});

describe('recentLabel', () => {
  it('names the first items and the count', () => {
    expect(recentLabel('Tritanium 5\nPyerite 3\nMexallon 2\nIsogen 1')).toEqual({
      names: ['Tritanium', 'Pyerite'],
      more: 2,
    });
  });

  it('has no overflow count for a short list', () => {
    expect(recentLabel('Tritanium\t5')).toEqual({ names: ['Tritanium'], more: 0 });
  });
});
