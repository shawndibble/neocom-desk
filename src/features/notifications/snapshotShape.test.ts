import { describe, expect, it } from 'vitest';
import { is, shapeGuard } from './snapshotShape';

interface Row {
  id: number;
  at: number;
  label: string;
  live: boolean;
  parent: number | null;
  note?: string;
  kind: 'a' | 'b';
  tags: readonly string[];
}

const isRow = shapeGuard<Row>({
  id: is.number,
  at: is.finite,
  label: is.string,
  live: is.boolean,
  parent: is.nullable(is.number),
  note: is.optional(is.string),
  kind: is.oneOf(['a', 'b'] as const),
  tags: is.arrayOf(is.string),
});

const ROW: Row = { id: 1, at: 2, label: 'x', live: true, parent: null, kind: 'a', tags: ['t'] };

describe('shapeGuard', () => {
  it('accepts a full row, with or without its optional field', () => {
    expect(isRow(ROW)).toBe(true);
    expect(isRow({ ...ROW, note: 'n' })).toBe(true);
  });

  it('ignores fields the description does not name', () => {
    expect(isRow({ ...ROW, extra: 1 })).toBe(true);
  });

  it('rejects anything that is not an object', () => {
    for (const junk of [null, undefined, 'x', 7, true]) expect(isRow(junk)).toBe(false);
  });

  it('rejects a missing required field, including a nullable one', () => {
    for (const field of Object.keys(ROW)) {
      const copy: Record<string, unknown> = { ...ROW };
      delete copy[field];
      expect(isRow(copy)).toBe(false);
    }
  });

  it('is.optional admits absent but not null', () => {
    expect(isRow({ ...ROW, note: undefined })).toBe(true);
    expect(isRow({ ...ROW, note: null })).toBe(false);
    expect(isRow({ ...ROW, note: 4 })).toBe(false);
  });

  it('is.nullable admits null and the inner type only', () => {
    expect(isRow({ ...ROW, parent: 3 })).toBe(true);
    expect(isRow({ ...ROW, parent: '3' })).toBe(false);
  });

  it('is.number accepts NaN, is.finite does not', () => {
    expect(isRow({ ...ROW, id: NaN })).toBe(true);
    expect(isRow({ ...ROW, at: NaN })).toBe(false);
    expect(isRow({ ...ROW, at: Infinity })).toBe(false);
    expect(isRow({ ...ROW, at: '2' })).toBe(false);
  });

  it('is.oneOf rejects values outside the list, whatever their type', () => {
    expect(isRow({ ...ROW, kind: 'c' })).toBe(false);
    expect(isRow({ ...ROW, kind: 1 })).toBe(false);
  });

  it('is.arrayOf requires an array whose every element passes', () => {
    expect(isRow({ ...ROW, tags: [] })).toBe(true);
    expect(isRow({ ...ROW, tags: ['a', 1] })).toBe(false);
    expect(isRow({ ...ROW, tags: 'a' })).toBe(false);
  });

  it('nests: a guard is a check', () => {
    const isGroup = shapeGuard<{ rows: readonly Row[] }>({ rows: is.arrayOf(isRow) });
    expect(isGroup({ rows: [ROW] })).toBe(true);
    expect(isGroup({ rows: [{ ...ROW, id: 'x' }] })).toBe(false);
  });
});
