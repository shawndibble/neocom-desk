import { describe, expect, it } from 'vitest';
import { buildLabelTabMap, resolveMailTab, unreadCountsByTab } from './mail';

describe('buildLabelTabMap', () => {
  it('maps each recognized System Label name to its tab, case-insensitively', () => {
    const map = buildLabelTabMap([
      { label_id: 1, name: 'Inbox' },
      { label_id: 2, name: 'Sent' },
      { label_id: 3, name: 'CORP' },
      { label_id: 4, name: 'alliance' },
    ]);
    expect(map.get(1)).toBe('inbox');
    expect(map.get(2)).toBe('sent');
    expect(map.get(3)).toBe('corp');
    expect(map.get(4)).toBe('alliance');
  });

  it('omits a Custom Label (unrecognized name) from the map', () => {
    const map = buildLabelTabMap([
      { label_id: 1, name: 'Inbox' },
      { label_id: 100, name: 'Miners' },
    ]);
    expect(map.has(100)).toBe(false);
    expect(map.size).toBe(1);
  });

  it('omits a label with no name', () => {
    const map = buildLabelTabMap([{ label_id: 100 }]);
    expect(map.size).toBe(0);
  });
});

describe('resolveMailTab', () => {
  const labelTabById = buildLabelTabMap([
    { label_id: 1, name: 'Inbox' },
    { label_id: 2, name: 'Sent' },
    { label_id: 3, name: 'Corp' },
    { label_id: 4, name: 'Alliance' },
  ]);

  it('resolves a single recognized label to its tab', () => {
    expect(resolveMailTab([3], labelTabById)).toBe('corp');
  });

  it('folds an empty labels array into inbox', () => {
    expect(resolveMailTab([], labelTabById)).toBe('inbox');
  });

  it('folds undefined labels into inbox', () => {
    expect(resolveMailTab(undefined, labelTabById)).toBe('inbox');
  });

  it('folds a Custom Label id (not in the map) into inbox', () => {
    expect(resolveMailTab([100], labelTabById)).toBe('inbox');
  });

  it('prefers Sent over Alliance and Corp when a header carries more than one System Label', () => {
    expect(resolveMailTab([1, 2, 3, 4], labelTabById)).toBe('sent');
  });

  it('prefers Alliance over Corp and Inbox', () => {
    expect(resolveMailTab([1, 3, 4], labelTabById)).toBe('alliance');
  });

  it('prefers Corp over Inbox', () => {
    expect(resolveMailTab([1, 3], labelTabById)).toBe('corp');
  });
});

describe('unreadCountsByTab', () => {
  it('maps each recognized System Label to its own unread_count', () => {
    const map = unreadCountsByTab([
      { label_id: 1, name: 'Inbox', unread_count: 5 },
      { label_id: 3, name: 'Corp', unread_count: 0 },
      { label_id: 4, name: 'Alliance', unread_count: 2 },
    ]);
    expect(map.get('inbox')).toBe(5);
    expect(map.get('corp')).toBe(0);
    expect(map.get('alliance')).toBe(2);
    expect(map.has('sent')).toBe(false);
  });

  it('ignores a Custom Label', () => {
    const map = unreadCountsByTab([{ label_id: 100, name: 'Miners', unread_count: 9 }]);
    expect(map.size).toBe(0);
  });

  it('defaults a missing unread_count to 0', () => {
    const map = unreadCountsByTab([{ label_id: 1, name: 'Inbox' }]);
    expect(map.get('inbox')).toBe(0);
  });
});
