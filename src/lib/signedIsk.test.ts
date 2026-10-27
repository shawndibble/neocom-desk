import { describe, it, expect } from 'vitest';
import { marketIskTone, signedMarketIsk } from '@/lib/signedIsk';

describe('signedMarketIsk', () => {
  it('signs a gain, keeps the minus, and leaves a zero unsigned', () => {
    expect(signedMarketIsk(30)).toBe('+30.00');
    expect(signedMarketIsk(-30.1)).toBe('-30.10');
    expect(signedMarketIsk(0)).toBe('0.00');
    expect(signedMarketIsk(0.004)).toBe('0.00');
  });

  it('drops cents from 10,000 up, as Market prices do', () => {
    expect(signedMarketIsk(12_345.67)).toBe('+12,346');
  });
});

describe('marketIskTone', () => {
  it('tones what it prints: green with a plus, red with a minus, none at 0.00', () => {
    expect(marketIskTone(30)).toBe('text-isk-pos');
    expect(marketIskTone(-30)).toBe('text-isk-neg');
    expect(marketIskTone(0)).toBeUndefined();
    expect(marketIskTone(-0.004)).toBeUndefined();
  });
});
