import { describe, it, expect } from 'vitest';
import { balanceAdjustment, accountBalance } from './balanceAdjustment';

describe('accountBalance', () => {
  it('is owed less credit: positive is owed', () => {
    expect(accountBalance({ owed: 300, credit: 0 })).toBe(300);
    expect(accountBalance({ owed: 0, credit: 500 })).toBe(-500);
  });
});

describe('balanceAdjustment', () => {
  it('charges the difference when the target owes more', () => {
    expect(balanceAdjustment(1_000, 4_000)).toBe(3_000);
  });
  it('credits the difference when the target owes less, or holds credit', () => {
    expect(balanceAdjustment(4_000, 1_000)).toBe(-3_000);
    expect(balanceAdjustment(1_000, -2_000)).toBe(-3_000);
  });
  it('is zero when the balance already matches, and whole ISK', () => {
    expect(balanceAdjustment(500, 500)).toBe(0);
    expect(balanceAdjustment(0.2, 0)).toBe(0);
    expect(balanceAdjustment(0, 10.6)).toBe(11);
  });
});
