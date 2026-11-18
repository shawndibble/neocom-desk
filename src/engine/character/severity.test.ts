import { DAY_MS, HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import {
  DEADLINE_SEVERITIES,
  compareSeverity,
  severityForRemaining,
  worstSeverity,
  type DeadlineSeverity,
} from './severity';

describe('severityForRemaining', () => {
  /**
   * The boundaries, pinned exactly. This ladder is shared by the corp ops
   * board and the character's Coming Up rail, and the whole reason it lives in
   * one module is that a second copy could drift a threshold without anything
   * going red. These boundary cases are that alarm.
   */
  it('places each default threshold on the closed side of its band', () => {
    expect(severityForRemaining(HOUR_MS)).toBe('critical');
    expect(severityForRemaining(HOUR_MS + 1)).toBe('warning');
    expect(severityForRemaining(24 * HOUR_MS)).toBe('warning');
    expect(severityForRemaining(24 * HOUR_MS + 1)).toBe('clear');
  });

  it('keeps the longer lead for the logistics profile', () => {
    expect(severityForRemaining(24 * HOUR_MS, 'logistics')).toBe('critical');
    expect(severityForRemaining(24 * HOUR_MS + 1, 'logistics')).toBe('warning');
    expect(severityForRemaining(3 * DAY_MS, 'logistics')).toBe('warning');
    expect(severityForRemaining(3 * DAY_MS + 1, 'logistics')).toBe('watch');
    expect(severityForRemaining(7 * DAY_MS, 'logistics')).toBe('watch');
    expect(severityForRemaining(7 * DAY_MS + 1, 'logistics')).toBe('clear');
  });

  /**
   * Overdue is the most urgent thing a board can hold, and it arrives as a
   * negative rather than as a separate state — the caller keeps `remainingMs`
   * unclamped so overdue items still order against each other.
   */
  it('treats an elapsed deadline as critical', () => {
    expect(severityForRemaining(0)).toBe('critical');
    expect(severityForRemaining(-1)).toBe('critical');
    expect(severityForRemaining(-30 * DAY_MS)).toBe('critical');
  });

  /**
   * `null` is "there is a clock but we cannot read it" — a structure whose
   * `fuel_expires` ESI drops once it runs dry. Not knowing is a caution, never
   * an all-clear.
   */
  it('answers warning when there is no reading at all', () => {
    expect(severityForRemaining(null)).toBe('warning');
  });

  it('orders the exported list worst-first', () => {
    expect(DEADLINE_SEVERITIES).toEqual(['critical', 'warning', 'watch', 'clear']);
  });
});

describe('compareSeverity', () => {
  it('sorts worst first', () => {
    const shuffled: DeadlineSeverity[] = ['clear', 'critical', 'watch', 'warning'];
    expect([...shuffled].sort(compareSeverity)).toEqual(['critical', 'warning', 'watch', 'clear']);
  });
});

describe('worstSeverity', () => {
  it('picks the worst of several', () => {
    expect(worstSeverity(['clear', 'warning', 'watch'])).toBe('warning');
    expect(worstSeverity(['watch', 'critical'])).toBe('critical');
  });

  /*
   * `clear`, not null: every caller is choosing a tone for something it is
   * already rendering, and an empty list means "nothing in it needs you" —
   * which is exactly what `clear` says.
   */
  it('reads an empty list as clear', () => {
    expect(worstSeverity([])).toBe('clear');
  });
});
