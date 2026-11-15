import { describe, expect, it } from 'vitest';
import { corporationNamed } from './payeeCorporation';

const books = [
  { corporationId: 98000001, name: 'Corp A' },
  { corporationId: 98000002, name: 'Moon Holdings' },
];

describe('corporationNamed', () => {
  it('finds the Corp Tax Book corporation a typed Payee name names', () => {
    expect(corporationNamed('Corp A', books)).toEqual(books[0]);
  });

  it('ignores case and surrounding spaces, as a pilot types them', () => {
    expect(corporationNamed('  moon holdings ', books)).toEqual(books[1]);
  });

  it('matches whole names only, never a prefix', () => {
    expect(corporationNamed('Corp', books)).toBeUndefined();
    expect(corporationNamed('Corp A moon', books)).toBeUndefined();
  });

  it('finds nothing for a blank name', () => {
    expect(corporationNamed('   ', books)).toBeUndefined();
  });
});
