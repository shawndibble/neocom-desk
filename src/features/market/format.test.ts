import { describe, it, expect } from 'vitest';
import { formatVsMedianPct } from './format';

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
