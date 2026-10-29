import { describe, expect, it } from 'vitest';
import { groupTick, groupToggleTarget, showsOwnGain } from './improveMakeoverTicks';

const keys = ['a', 'b', 'c'];

describe('groupTick', () => {
  it('is all, some or none by how many rows are ticked', () => {
    expect(groupTick(keys, new Set(keys))).toBe('all');
    expect(groupTick(keys, new Set(['a', 'c']))).toBe('some');
    expect(groupTick(keys, new Set())).toBe('none');
  });
  it('ignores ticks that belong to other rows', () => {
    expect(groupTick(keys, new Set(['x']))).toBe('none');
  });
});

describe('groupToggleTarget', () => {
  it('ticks every row unless all are ticked already', () => {
    expect(groupToggleTarget('none')).toBe(true);
    expect(groupToggleTarget('some')).toBe(true);
    expect(groupToggleTarget('all')).toBe(false);
  });
});

describe('showsOwnGain', () => {
  it('shows only while the group is partly ticked', () => {
    expect(showsOwnGain('all')).toBe(false);
    expect(showsOwnGain('none')).toBe(false);
    expect(showsOwnGain('some')).toBe(true);
  });
});
