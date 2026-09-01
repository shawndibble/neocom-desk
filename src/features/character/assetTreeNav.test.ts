import { describe, it, expect } from 'vitest';
import { arrowLeft, arrowRight, typeAheadIndex, type NavRow } from './assetTreeNav';

function row(overrides: Partial<NavRow> & { key: string; level: number }): NavRow {
  return {
    hasChildren: false,
    isOpen: false,
    canToggle: false,
    label: '',
    ...overrides,
  };
}

describe('arrowRight', () => {
  it('expands a collapsed, toggleable branch without moving focus', () => {
    const rows = [row({ key: 'a', level: 1, hasChildren: true, isOpen: false, canToggle: true })];
    expect(arrowRight(rows, 0)).toEqual({ kind: 'toggle', key: 'a' });
  });

  it('moves focus into the first child of an already-open branch', () => {
    const rows = [
      row({ key: 'a', level: 1, hasChildren: true, isOpen: true, canToggle: true }),
      row({ key: 'a/b', level: 2 }),
    ];
    expect(arrowRight(rows, 0)).toEqual({ kind: 'moveTo', index: 1 });
  });

  it('does nothing on an already-open branch whose next row is a sibling, not a child', () => {
    const rows = [
      row({ key: 'a', level: 1, hasChildren: true, isOpen: true, canToggle: true }),
      row({ key: 'b', level: 1 }),
    ];
    expect(arrowRight(rows, 0)).toEqual({ kind: 'none' });
  });

  it('does nothing on a leaf row', () => {
    const rows = [row({ key: 'a', level: 1 })];
    expect(arrowRight(rows, 0)).toEqual({ kind: 'none' });
  });

  it('treats an always-open, non-toggleable row (a station) as expanded: moves into its first child', () => {
    const rows = [
      row({ key: 'station:1', level: 1, hasChildren: true, isOpen: true, canToggle: false }),
      row({ key: 'station:1/i:10', level: 2 }),
    ];
    expect(arrowRight(rows, 0)).toEqual({ kind: 'moveTo', index: 1 });
  });
});

describe('arrowLeft', () => {
  it('collapses an open, toggleable branch in place', () => {
    const rows = [row({ key: 'a', level: 1, hasChildren: true, isOpen: true, canToggle: true })];
    expect(arrowLeft(rows, 0)).toEqual({ kind: 'toggle', key: 'a' });
  });

  it('moves focus to the parent from a collapsed branch', () => {
    const rows = [
      row({ key: 'a', level: 1, hasChildren: true, isOpen: false, canToggle: true }),
      row({ key: 'a/b', level: 2, hasChildren: true, isOpen: false, canToggle: true }),
    ];
    expect(arrowLeft(rows, 1)).toEqual({ kind: 'moveTo', index: 0 });
  });

  it('moves focus to the parent from a leaf', () => {
    const rows = [row({ key: 'a', level: 1 }), row({ key: 'a/b', level: 2 })];
    expect(arrowLeft(rows, 1)).toEqual({ kind: 'moveTo', index: 0 });
  });

  it('does nothing at the top level with no parent', () => {
    const rows = [row({ key: 'a', level: 1 })];
    expect(arrowLeft(rows, 0)).toEqual({ kind: 'none' });
  });

  it('moves to parent instead of toggling when the row is open but not toggleable (search-forced expansion)', () => {
    const rows = [
      row({ key: 'a', level: 1, hasChildren: true, isOpen: true, canToggle: true }),
      row({ key: 'a/b', level: 2, hasChildren: true, isOpen: true, canToggle: false }),
    ];
    expect(arrowLeft(rows, 1)).toEqual({ kind: 'moveTo', index: 0 });
  });

  it('skips over sibling rows to find the nearest shallower ancestor', () => {
    const rows = [
      row({ key: 'a', level: 1, hasChildren: true, isOpen: true, canToggle: true }),
      row({ key: 'a/b', level: 2, hasChildren: true, isOpen: true, canToggle: true }),
      row({ key: 'a/b/c', level: 3 }),
    ];
    expect(arrowLeft(rows, 2)).toEqual({ kind: 'moveTo', index: 1 });
  });
});

describe('typeAheadIndex', () => {
  const rows = [
    row({ key: '1', level: 1, label: 'Apple' }),
    row({ key: '2', level: 1, label: 'Banana' }),
    row({ key: '3', level: 1, label: 'apricot' }),
  ];

  it('finds the next row starting with the typed letter, case-insensitively', () => {
    expect(typeAheadIndex(rows, 0, 'b')).toBe(1);
  });

  it('wraps around to the start of the list', () => {
    expect(typeAheadIndex(rows, 1, 'a')).toBe(2);
  });

  it('cycles past the current match to the next one on repeated presses', () => {
    expect(typeAheadIndex(rows, 2, 'a')).toBe(0);
  });

  it('returns null when nothing else matches', () => {
    expect(typeAheadIndex(rows, 0, 'z')).toBeNull();
  });
});
