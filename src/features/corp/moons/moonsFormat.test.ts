import { describe, it, expect } from 'vitest';
import {
  atDate,
  clockAt,
  dateTimeAt,
  dateWithYear,
  shortDate,
  shortDateTime,
  signedIsk,
} from './moonsFormat';

describe('dateWithYear', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  it('adds the year only when it is not the current one', () => {
    expect(dateWithYear('2026-10-18', now)).toBe('18 Oct');
    expect(dateWithYear('2025-12-30T10:00:00Z', now)).toBe('30 Dec 2025');
  });
  it('marks an instant shown in EVE time as UTC', () => {
    expect(dateTimeAt('2026-10-18T14:00:00Z', 'UTC', now)).toBe('18 Oct 14:00\u00a0UTC');
  });
});

/** Runs `fn` with the host clock in `zone`, the way the viewer's own clock is read. */
function inHostZone(zone: string, fn: () => void) {
  const was = process.env.TZ;
  process.env.TZ = zone;
  try {
    fn();
  } finally {
    process.env.TZ = was;
  }
}

describe('instants follow the Time format clock', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  // 23:30 EVE time on the 18th is already the 19th in Auckland (UTC+13).
  const late = '2026-10-18T23:30:00Z';

  it('reads EVE time when the setting is EVE time', () => {
    inHostZone('Pacific/Auckland', () => {
      expect(atDate(late, 'UTC')).toBe('18 Oct');
      expect(shortDateTime(late, 'UTC')).toBe('18 Oct 23:30');
      expect(clockAt(Date.parse(late), 'UTC')).toBe('23:30\u00a0UTC');
    });
  });

  it("reads the viewer's own clock, unmarked, when the setting is local", () => {
    inHostZone('Pacific/Auckland', () => {
      expect(atDate(late, undefined)).toBe('19 Oct');
      expect(shortDateTime(late, undefined)).toBe('19 Oct 12:30');
      expect(dateTimeAt(late, undefined, now)).toBe('19 Oct 12:30');
      expect(clockAt(Date.parse(late), undefined)).toBe('12:30');
    });
  });

  it('leaves a ledger day an EVE day whatever the clock', () => {
    inHostZone('Pacific/Auckland', () => expect(shortDate('2026-10-18')).toBe('18 Oct'));
  });
});

describe('signedIsk', () => {
  it('shows the direction with a real minus sign', () => {
    expect(signedIsk(-1_800_000)).toBe('\u22121,800,000');
    expect(signedIsk(4_200_000)).toBe('+4,200,000');
  });
});
