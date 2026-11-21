import { describe, expect, it } from 'vitest';
import { madePaymentHref } from './madePaymentHref';

describe('madePaymentHref', () => {
  it('links a journal entry and a contract, and nothing else', () => {
    expect(madePaymentHref({ kind: 'journal', refId: 42 })).toBe('/wallet/journal?highlight=42');
    expect(madePaymentHref({ kind: 'contract', refId: 7 })).toBe('/contracts?highlight=7');
    expect(madePaymentHref({ kind: 'recorded', refId: 'r-1' })).toBeNull();
    expect(madePaymentHref({ kind: 'legacy', refId: 'l-1' })).toBeNull();
  });
});
