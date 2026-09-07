import { describe, it, expect } from 'vitest';
import { BOARD_SEVERITIES, compareSeverity, worstSeverity, type BoardSeverity } from './severity';

describe('BOARD_SEVERITIES', () => {
  it('is worst-first, so its index is the rank', () => {
    expect(BOARD_SEVERITIES).toEqual(['critical', 'warning', 'watch', 'clear']);
  });
});

describe('compareSeverity', () => {
  it('sorts worst first', () => {
    const shuffled: BoardSeverity[] = ['clear', 'critical', 'watch', 'warning'];
    expect([...shuffled].sort(compareSeverity)).toEqual(['critical', 'warning', 'watch', 'clear']);
  });
});

describe('worstSeverity', () => {
  it('picks the worst of several', () => {
    expect(worstSeverity(['clear', 'warning', 'watch'])).toBe('warning');
    expect(worstSeverity(['clear', 'clear'])).toBe('clear');
    expect(worstSeverity(['watch', 'critical'])).toBe('critical');
  });

  /*
   * `clear`, not null: every caller here is choosing a tone for something it
   * is already rendering, and an empty list means "nothing in it needs you"
   * — which is exactly what `clear` says. A null would push the same decision
   * out to every call site.
   */
  it('reads an empty list as clear', () => {
    expect(worstSeverity([])).toBe('clear');
  });
});
