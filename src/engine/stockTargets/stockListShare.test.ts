import { describe, expect, it } from 'vitest';
import { decodeStockListShare, encodeStockListShare, MAX_SHARED_ITEMS } from './stockListShare';

const EFA = 1035466617946;
const EFA36 = EFA.toString(36);

const list = {
  name: 'Efa Market · 2026',
  locationId: EFA,
  items: [
    { typeId: 16240, target: 40 },
    { typeId: 230, target: 20000 },
  ],
};

describe('stock list share code', () => {
  it('round-trips a list name, its market and its Stock Targets', () => {
    expect(decodeStockListShare(encodeStockListShare(list))).toEqual(list);
  });

  it('is URL-safe and survives the link reading it back, even with % in the name', () => {
    const odd = { ...list, name: '100% Stocked & co' };
    const code = encodeStockListShare(odd);
    expect(code).toMatch(/^[A-Za-z0-9._~%-]+$/);
    // The Stock tab reads it back with `searchParams.get`, which decodes once.
    expect(decodeStockListShare(new URLSearchParams(`list=${code}`).get('list') ?? '')).toEqual(
      odd
    );
  });

  it('rejects a code from another format, or a damaged one', () => {
    expect(decodeStockListShare(`9|x|${EFA36}|1:1`)).toBeNull();
    expect(decodeStockListShare('1|name|a:1')).toBeNull();
    expect(decodeStockListShare('garbage')).toBeNull();
    expect(decodeStockListShare(`2|name|${EFA36}|zz:`)).toBeNull();
    expect(decodeStockListShare(`2||${EFA36}|a:1`)).toBeNull();
    expect(decodeStockListShare('2|name|-|a:1')).toBeNull();
  });

  it('drops unusable pairs but keeps the rest', () => {
    const code = `2|Efa|${EFA36}|a:1,-5:3,b:0,c:2`;
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
    const code = `2|Big|${EFA36}|${many.join(',')}`;
    expect(decodeStockListShare(code)?.items).toHaveLength(MAX_SHARED_ITEMS);
  });
});
