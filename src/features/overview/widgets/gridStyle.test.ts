import { describe, expect, it } from 'vitest';
import { flexRule, GRID_GAP, PHONE_GRID_GAP } from './gridStyle';

describe('flexRule on desktop', () => {
  it('sizes S, M and L as a third, a half and two thirds of the row, less the gap', () => {
    expect(flexRule('S', false).flexBasis).toBe(`calc(33.333% - ${GRID_GAP}px)`);
    expect(flexRule('M', false).flexBasis).toBe(`calc(50.000% - ${GRID_GAP}px)`);
    expect(flexRule('L', false).flexBasis).toBe(`calc(66.667% - ${GRID_GAP}px)`);
  });

  it('wraps each size at its own minimum width', () => {
    expect(flexRule('S', false).minWidth).toBe(190);
    expect(flexRule('M', false).minWidth).toBe(260);
    expect(flexRule('L', false).minWidth).toBe(340);
  });

  it('gives Full the whole row', () => {
    expect(flexRule('F', false)).toMatchObject({ flexBasis: '100%', flexGrow: 1 });
  });

  it('lets a Large take twice a Small share of a row leftover', () => {
    expect(flexRule('L', false).flexGrow).toBe(2);
    expect(flexRule('S', false).flexGrow).toBe(1);
  });
});

describe('flexRule on a phone', () => {
  it('puts two Smalls across', () => {
    expect(flexRule('S', true)).toMatchObject({
      flexBasis: `calc(50% - ${PHONE_GRID_GAP}px)`,
      minWidth: 0,
    });
  });

  it('gives M, L and Full the full width', () => {
    for (const size of ['M', 'L', 'F'] as const) {
      expect(flexRule(size, true)).toMatchObject({ flexBasis: '100%', minWidth: 0 });
    }
  });
});
