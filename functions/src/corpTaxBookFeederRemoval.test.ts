import { describe, expect, it } from 'vitest';
import {
  parseRemovalCall,
  parseRemovalLinkCall,
  parseRemovalNoticeCall,
} from './corpTaxBookFeederRemoval.js';
import { parseSetFeederPayeeInput } from './corpTaxBookFeederOwnerCalls.js';

const book = { corporationId: 98000001, accessToken: 'tok' };

describe('removal input', () => {
  it('needs the moon owner corporation', () => {
    expect(parseRemovalCall({ ...book, feederCorporationId: 98000002 }).feederCorporationId).toBe(
      98000002
    );
    expect(() => parseRemovalCall(book)).toThrow();
    expect(() => parseRemovalCall({ ...book, feederCorporationId: 0 })).toThrow();
  });

  it('takes an optional send time and refuses a non-number', () => {
    const base = { ...book, feederCorporationId: 98000002 };
    expect(parseRemovalNoticeCall(base).sentAt).toBeUndefined();
    expect(parseRemovalNoticeCall({ ...base, sentAt: 5 }).sentAt).toBe(5);
    expect(() => parseRemovalNoticeCall({ ...base, sentAt: 'now' })).toThrow();
  });

  it('bounds the link code', () => {
    expect(parseRemovalLinkCall({ code: 'abc' }).code).toBe('abc');
    expect(() => parseRemovalLinkCall({ code: '' })).toThrow();
    expect(() => parseRemovalLinkCall({ code: 'x'.repeat(65) })).toThrow();
  });
});

describe('payee input', () => {
  const base = { ...book, feederCorporationId: 98000002 };
  it('takes a player or a corporation', () => {
    expect(
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'character', id: 5 } }).payee
    ).toEqual({
      kind: 'character',
      id: 5,
    });
    expect(
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'corporation', id: 9 } }).payee.kind
    ).toBe('corporation');
  });
  it('refuses anything else', () => {
    expect(() =>
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'alliance', id: 5 } })
    ).toThrow();
    expect(() =>
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'character', id: 0 } })
    ).toThrow();
    expect(() => parseSetFeederPayeeInput(base)).toThrow();
  });
});
