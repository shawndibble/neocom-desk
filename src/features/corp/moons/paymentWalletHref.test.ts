import { describe, expect, it } from 'vitest';
import { paymentWalletHref } from './paymentWalletHref';

describe('paymentWalletHref', () => {
  it('points a journal donation at its division and entry', () => {
    expect(paymentWalletHref('j3_5550123')).toBe('/corp/wallet?division=3&highlight=5550123');
  });
  it('has no link for a hand-recorded payment', () => {
    expect(paymentWalletHref('m-abc')).toBeNull();
    expect(paymentWalletHref('jx_1')).toBeNull();
  });
});
