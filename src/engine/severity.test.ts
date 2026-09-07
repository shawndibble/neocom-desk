import { describe, expect, it } from 'vitest';
import { DEADLINE_SEVERITIES, severityForRemaining } from './severity';

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('severityForRemaining', () => {
  /**
   * The boundaries, pinned exactly. This ladder is shared by the corp ops
   * board and the character's Coming Up rail, and the whole reason it lives in
   * one module is that a second copy could drift a threshold without anything
   * going red. These four cases are that alarm.
   */
  it('places each threshold on the closed side of its band', () => {
    expect(severityForRemaining(24 * HOUR)).toBe('critical');
    expect(severityForRemaining(24 * HOUR + 1)).toBe('warning');
    expect(severityForRemaining(3 * DAY)).toBe('warning');
    expect(severityForRemaining(3 * DAY + 1)).toBe('watch');
    expect(severityForRemaining(7 * DAY)).toBe('watch');
    expect(severityForRemaining(7 * DAY + 1)).toBe('clear');
  });

  /**
   * Overdue is the most urgent thing a board can hold, and it arrives as a
   * negative rather than as a separate state — the caller keeps `remainingMs`
   * unclamped so overdue items still order against each other.
   */
  it('treats an elapsed deadline as critical', () => {
    expect(severityForRemaining(0)).toBe('critical');
    expect(severityForRemaining(-1)).toBe('critical');
    expect(severityForRemaining(-30 * DAY)).toBe('critical');
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
