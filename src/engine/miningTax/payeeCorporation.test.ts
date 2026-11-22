import { describe, expect, it } from 'vitest';
import {
  bookOwnedPayeeIds,
  corporationNamed,
  payeesOfBookCorporation,
  type PayeeLike,
} from './payeeCorporation';

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

describe('payeesOfBookCorporation', () => {
  const bureau = { corporationId: 98837836, name: 'Bureau of Unified Harvesting' };
  const payee = (over: Partial<PayeeLike>) => ({
    id: 'p',
    name: 'Bureau of Unified Harvesting',
    ...over,
  });

  it('takes a Payee verified as the corporation, or carrying its id with no kind recorded', () => {
    expect(
      payeesOfBookCorporation([payee({ entityId: 98837836, entityKind: 'corporation' })], bureau)
    ).toEqual([{ id: 'p', link: false }]);
    expect(payeesOfBookCorporation([payee({ entityId: 98837836 })], bureau)).toEqual([
      { id: 'p', link: true },
    ]);
  });

  // EVE names are unique: an unlinked Payee named exactly as the book's corporation is it, and
  // is linked so every device agrees.
  it('takes an unlinked Payee named exactly as the corporation, to be linked', () => {
    expect(
      payeesOfBookCorporation([payee({ name: ' bureau of unified harvesting ' })], bureau)
    ).toEqual([{ id: 'p', link: true }]);
  });

  it('keeps a same-named unlinked Payee apart when another one carries the id', () => {
    expect(
      payeesOfBookCorporation(
        [
          payee({ id: 'label' }),
          payee({ id: 'linked', entityId: 98837836, entityKind: 'corporation' }),
        ],
        bureau
      )
    ).toEqual([{ id: 'linked', link: false }]);
  });

  // Payees are per Character: an alt's unlinked one is judged on its own, not hidden by the main's.
  it("judges each Character's Payees apart", () => {
    expect(
      payeesOfBookCorporation(
        [
          payee({ id: 'main', characterId: 1, entityId: 98837836, entityKind: 'corporation' }),
          payee({ id: 'alt', characterId: 2 }),
          payee({ id: 'mainLabel', characterId: 1 }),
        ],
        bureau
      )
    ).toEqual([
      { id: 'main', link: false },
      { id: 'alt', link: true },
    ]);
  });

  it('never takes a Payee linked to someone else, or only similar in name', () => {
    expect(
      payeesOfBookCorporation(
        [
          payee({ id: 'a', entityId: 1, entityKind: 'corporation' }),
          payee({ id: 'b', entityId: 98837836, entityKind: 'character' }),
          payee({ id: 'c', name: 'Bureau of Unified Harvesting Alt' }),
        ],
        bureau
      )
    ).toEqual([]);
  });
});

describe('bookOwnedPayeeIds', () => {
  const bureau = { corporationId: 98837836, name: 'Bureau of Unified Harvesting' };
  const record = (over: Partial<PayeeLike>): PayeeLike => ({
    id: 'p',
    characterId: 1,
    name: 'Someone',
    ...over,
  });

  it('is every record verified as a book corporation, one per Character of a merged Payee', () => {
    const ids = bookOwnedPayeeIds(
      [
        record({
          id: 'main',
          characterId: 1,
          entityId: bureau.corporationId,
          entityKind: 'corporation',
        }),
        record({
          id: 'alt',
          characterId: 2,
          entityId: bureau.corporationId,
          entityKind: 'corporation',
        }),
        record({ id: 'other', name: 'Ion Strider', entityId: 5, entityKind: 'character' }),
      ],
      [bureau]
    );
    expect([...ids].sort()).toEqual(['alt', 'main']);
  });

  it('matches the id a Payee carries with no kind recorded', () => {
    expect([
      ...bookOwnedPayeeIds([record({ id: 'a', entityId: bureau.corporationId })], [bureau]),
    ]).toEqual(['a']);
  });

  it('never goes by name: a same-named Payee that is not verified as the corporation is not its', () => {
    const ids = bookOwnedPayeeIds(
      [
        record({ id: 'named', name: bureau.name }),
        record({ id: 'someoneElse', name: bureau.name, entityId: 7, entityKind: 'character' }),
      ],
      [bureau]
    );
    expect(ids.size).toBe(0);
  });
});
