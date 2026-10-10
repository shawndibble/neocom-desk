import { describe, expect, it } from 'vitest';
import { decodeStockListShare, encodeStockListShare, MAX_SHARED_ITEMS } from './stockListShare';

const list = {
  name: 'Efa Market · 2026',
  items: [
    { typeId: 16240, target: 40 },
    { typeId: 230, target: 20000 },
  ],
};

describe('stock list share code', () => {
  it('round-trips a list name and its Stock Targets', () => {
    expect(decodeStockListShare(encodeStockListShare(list))).toEqual(list);
  });

  it('is URL-safe', () => {
    expect(encodeStockListShare(list)).toMatch(/^[A-Za-z0-9._~%-]+$/);
  });

  it('rejects a code from a newer format, or a damaged one', () => {
    expect(decodeStockListShare('9|x|1:1')).toBeNull();
    expect(decodeStockListShare('garbage')).toBeNull();
    expect(decodeStockListShare('1|name|zz:')).toBeNull();
    expect(decodeStockListShare('1||a:1')).toBeNull();
  });

  it('drops unusable pairs but keeps the rest', () => {
    const code = encodeURIComponent('1|Efa|a:1,-5:3,b:0,c:2');
    expect(decodeStockListShare(code)?.items).toEqual([
      { typeId: 10, target: 1 },
      { typeId: 12, target: 2 },
    ]);
  });

  it('caps how many items a pasted code can carry', () => {
    const many = Array.from(
      { length: MAX_SHARED_ITEMS + 5 },
      (_, i) => `${(i + 1).toString(36)}:1`
    );
    const code = encodeURIComponent(`1|Big|${many.join(',')}`);
    expect(decodeStockListShare(code)?.items).toHaveLength(MAX_SHARED_ITEMS);
  });
});
