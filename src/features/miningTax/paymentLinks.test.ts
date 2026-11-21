import { describe, expect, it } from 'vitest';
import type { PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import {
  autoMatchRecorded,
  linkablePayments,
  recipientOf,
  suggestLink,
  suggestLinks,
  type LinkablePayee,
  type LinkContext,
  type MadePayment,
} from './paymentLinks';

const MAIN = 1;
const ALT = 2;
const LANDLORD = 90_000_001;
const CORP = 98_000_001;

const record = (over: Partial<PayeeRecord> = {}): PayeeRecord => ({
  id: 'p1',
  characterId: MAIN,
  name: 'Landlord',
  defaultTaxPct: 10,
  updatedAt: 1,
  ...over,
});

const payeeOf = (members: PayeeRecord[], owed = 1_000_000): LinkablePayee => ({
  id: members[0]!.id,
  name: members[0]!.name,
  members,
  owed,
  billed: true,
});

const made = (over: Partial<MadePayment> = {}): MadePayment => ({
  key: 'journal:10',
  kind: 'journal',
  refId: 10,
  characterId: MAIN,
  date: '2026-10-20T12:00:00Z',
  amount: 1_000_000,
  method: 'donation',
  counterpartyId: LANDLORD,
  counterpartyName: 'Landlord',
  label: 'Player donation',
  ...over,
});

const ctx = (payees: LinkablePayee[], over: Partial<LinkContext> = {}): LinkContext => ({
  payees,
  linked: new Set(),
  bookCorporations: new Set(),
  ...over,
});

const recorded = (over: Partial<PayeePaymentLink> = {}): PayeePaymentLink => ({
  payeeId: 'p1',
  kind: 'recorded',
  refId: 'r1',
  amount: 1_000_000,
  paidOn: '2026-10-20',
  source: 'manual',
  characterId: MAIN,
  ...over,
});

describe('recipientOf', () => {
  it('knows a Payee by the entity it learned, then by its name', () => {
    const learned = payeeOf([record({ entityId: LANDLORD, entityKind: 'character' })]);
    expect(recipientOf(made(), [learned])).toEqual({ payee: learned, confidence: 'entity' });
    const named = payeeOf([record()]);
    expect(recipientOf(made(), [named])).toEqual({ payee: named, confidence: 'name' });
  });

  it('never takes a name for a Payee that learned another entity', () => {
    const other = payeeOf([record({ entityId: 5 })]);
    expect(recipientOf(made(), [other])).toBeUndefined();
  });

  // Audit bug 2: an alt's payment is a merged Payee's even when its primary record is another
  // Character's.
  it("reads every record of a merged Payee, so an alt's payment is its own", () => {
    const merged = payeeOf([
      record({ id: 'p1', characterId: MAIN }),
      record({ id: 'p2', characterId: ALT, entityId: LANDLORD }),
    ]);
    expect(recipientOf(made({ characterId: ALT }), [merged])?.payee.id).toBe('p1');
  });

  it('is nobody when two Payees answer to the same name', () => {
    const a = payeeOf([record({ id: 'a' })]);
    const b = payeeOf([record({ id: 'b' })]);
    expect(recipientOf(made(), [a, b])).toBeUndefined();
  });
});

describe('suggestLink', () => {
  it('suggests the recipient whatever the amount, with no day window: back taxes too', () => {
    const p = payeeOf([record()]);
    const old = made({ amount: 123, date: '2026-06-01T00:00:00Z' });
    expect(suggestLink(old, ctx([p]))).toMatchObject({ payee: { id: 'p1' }, confidence: 'name' });
  });

  it('never suggests by amount a payment to a known recipient who is none of the Payees (N5)', () => {
    const toSomeoneElse = made({ counterpartyId: 77, counterpartyName: 'Someone' });
    const p = payeeOf([record({ id: 'p1', entityId: 5 })], 1_000_000);
    expect(suggestLink(toSomeoneElse, ctx([p]))).toBeNull();
  });

  it('falls back on an amount only when exactly one Payee owes it, its recipient unknown', () => {
    const anon = made({ counterpartyId: undefined, counterpartyName: undefined });
    const p = payeeOf([record({ id: 'p1', entityId: 5 })], 1_000_000);
    const q = payeeOf([record({ id: 'q1', name: 'Other', entityId: 6 })], 2_000_000);
    expect(suggestLink(anon, ctx([p, q]))).toMatchObject({
      payee: { id: 'p1' },
      confidence: 'amount',
    });
    const twin = payeeOf([record({ id: 'q2', name: 'Twin', entityId: 7 })], 1_000_000);
    expect(suggestLink(anon, ctx([p, twin]))).toBeNull();
  });

  // Audit bug 4: a donation the corporation's book holds (or has in flight) was offered to a
  // personal Payee by amount, counted twice and re-pointed the Payee at the corporation.
  it('never offers a donation to a corporation whose book counts it', () => {
    const p = payeeOf([record({ entityId: 5 })], 1_000_000);
    const toCorp = made({ counterpartyId: CORP, counterpartyName: 'Brass Meridian' });
    expect(suggestLink(toCorp, ctx([p], { bookCorporations: new Set([CORP]) }))).toBeNull();
  });

  // Audit bug 1: a suggestion aimed at a Corp Tax Book's Payee wrote Assignments for the book.
  it('never suggests a payment for a Corp Tax Book Payee: only personal Payees are linkable', () => {
    const corpPayee = payeeOf([
      record({ id: 'corp-book:98000001', name: 'Brass Meridian', entityId: CORP }),
    ]);
    const toCorp = made({ counterpartyId: CORP, counterpartyName: 'Brass Meridian' });
    expect(suggestLink(toCorp, ctx([corpPayee], { bookCorporations: new Set([CORP]) }))).toBeNull();
  });

  it('skips a payment already linked', () => {
    const p = payeeOf([record()]);
    expect(suggestLink(made(), ctx([p], { linked: new Set(['journal:10']) }))).toBeNull();
  });

  it('ranks a learned entity before a name and an amount, newest first', () => {
    const learned = payeeOf([record({ id: 'p1', entityId: LANDLORD })]);
    const named = payeeOf([record({ id: 'p2', name: 'Moon Lord', entityId: undefined })], 5);
    const list = suggestLinks(
      [
        made({ key: 'journal:1', refId: 1, counterpartyId: 42, counterpartyName: 'Moon Lord' }),
        made({ key: 'journal:2', refId: 2 }),
      ],
      ctx([learned, named])
    );
    expect(list.map((s) => [s.payment.refId, s.confidence])).toEqual([
      [2, 'entity'],
      [1, 'name'],
    ]);
  });
});

describe('linkablePayments', () => {
  it('leaves out what a link holds and what a book counts', () => {
    const payments = [
      made({ key: 'journal:1', refId: 1 }),
      made({ key: 'journal:2', refId: 2, counterpartyId: CORP }),
      made({ key: 'journal:3', refId: 3 }),
    ];
    const out = linkablePayments(
      payments,
      ctx([], { linked: new Set(['journal:3']), bookCorporations: new Set([CORP]) })
    );
    expect(out.map((p) => p.refId)).toEqual([1]);
  });
});

describe('autoMatchRecorded', () => {
  const p = payeeOf([record({ entityId: LANDLORD })]);

  it('links a recorded payment to the one transaction to its recipient of that amount and date', () => {
    expect(autoMatchRecorded([made()], [recorded()], ctx([p]))).toEqual([
      { link: recorded(), payment: made() },
    ]);
  });

  // Audit bug 3: the recipient was never checked.
  it('never links a transaction to someone else', () => {
    expect(autoMatchRecorded([made({ counterpartyId: 77 })], [recorded()], ctx([p]))).toEqual([]);
  });

  // Audit bug 3: two recorded payments of one amount could both claim one transaction.
  it('is one to one or nothing', () => {
    const two = [recorded({ refId: 'r1' }), recorded({ refId: 'r2' })];
    expect(autoMatchRecorded([made()], two, ctx([p]))).toEqual([]);
    const twins = [made({ key: 'journal:10' }), made({ key: 'journal:11', refId: 11 })];
    expect(autoMatchRecorded(twins, [recorded()], ctx([p]))).toEqual([]);
  });

  it('is the shared stated-transfer rule: its payer, its amount, within two days', () => {
    expect(
      autoMatchRecorded([made({ date: '2026-10-22T12:00:00Z' })], [recorded()], ctx([p]))
    ).toHaveLength(1);
    expect(
      autoMatchRecorded([made({ date: '2026-10-23T12:00:01Z' })], [recorded()], ctx([p]))
    ).toEqual([]);
    expect(autoMatchRecorded([made({ amount: 1_000_002 })], [recorded()], ctx([p]))).toEqual([]);
    expect(autoMatchRecorded([made()], [recorded({ characterId: MAIN + 1 })], ctx([p]))).toEqual(
      []
    );
  });
});
