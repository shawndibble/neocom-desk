import { describe, expect, it } from 'vitest';
import { flexRule, GRID_GAP, PHONE_GRID_GAP } from './gridStyle';

describe('flexRule on desktop', () => {
  it('sizes S, M and L as a quarter, a third and a half of the row, less the gap', () => {
    expect(flexRule('S', false).flexBasis).toBe(`calc(25.000% - ${GRID_GAP}px)`);
    expect(flexRule('M', false).flexBasis).toBe(`calc(33.333% - ${GRID_GAP}px)`);
    expect(flexRule('L', false).flexBasis).toBe(`calc(50.000% - ${GRID_GAP}px)`);
  });

  it('wraps each size at its own minimum width', () => {
    expect(flexRule('S', false).minWidth).toBe(220);
    expect(flexRule('M', false).minWidth).toBe(300);
    expect(flexRule('L', false).minWidth).toBe(440);
  });

  it('gives Full the whole row', () => {
    expect(flexRule('F', false)).toMatchObject({ flexBasis: '100%', flexGrow: 1 });
  });

  it('shares a row leftover equally, so a mixed row stays level', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      expect(flexRule(size, false).flexGrow).toBe(1);
    }
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
