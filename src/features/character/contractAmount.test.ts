import { describe, it, expect } from 'vitest';
import { contractAmount } from './contractAmount';

describe('contractAmount', () => {
  it('uses reward for a courier even when price is 0', () => {
    expect(contractAmount({ type: 'courier', price: 0, reward: 45_000_000 })).toBe(45_000_000);
  });

  it('uses price for item_exchange and auction', () => {
    expect(contractAmount({ type: 'item_exchange', price: 1000, reward: 5 })).toBe(1000);
    expect(contractAmount({ type: 'auction', price: 0, reward: undefined })).toBe(0);
  });

  it('falls back to reward when a non-courier has no price', () => {
    expect(contractAmount({ type: 'item_exchange', price: undefined, reward: 500 })).toBe(500);
  });

  it('is undefined when neither is present', () => {
    expect(
      contractAmount({ type: 'courier', price: undefined, reward: undefined })
    ).toBeUndefined();
  });
});
