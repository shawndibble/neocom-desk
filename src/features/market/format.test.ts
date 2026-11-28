import { afterEach, describe, it, expect } from 'vitest';
import { setDecimalMark } from '@/lib/numberLocale';
import { formatOrderLocationText, formatSignedPct, formatVsMedianPct } from './format';

describe('formatSignedPct', () => {
  afterEach(() => setDecimalMark('.'));
  it('signs and uses the active decimal mark', () => {
    expect(formatSignedPct(12.54, 1)).toBe('+12.5%');
    setDecimalMark(',');
    expect(formatSignedPct(-3, 1)).toBe('-3,0%');
    expect(formatSignedPct(0.01, 1)).toBe('0,0%');
  });
});

describe('formatVsMedianPct', () => {
  it('signs a whole percent with a plus or a real minus', () => {
    expect(formatVsMedianPct(35.2)).toBe('+35%');
    expect(formatVsMedianPct(-12.4)).toBe('−12%');
  });

  it('drops the sign when the figure rounds to zero', () => {
    expect(formatVsMedianPct(0.4)).toBe('0%');
    expect(formatVsMedianPct(-0.4)).toBe('0%');
  });
});

describe('formatOrderLocationText', () => {
  it('shows a positive security under 0.05 as 0.1, the way the game does', () => {
    const location = { stationName: 'Hub', systemName: 'Egbinger', security: 0.0346 };
    expect(formatOrderLocationText(location, '?')).toBe('Hub · Egbinger (0.1)');
  });
});
