import { describe, expect, it } from 'vitest';
import {
  MINING_TAX_WARNING_DAYS,
  comingUpSeverity,
  mailSeverity,
  miningTaxSeverity,
  priceAlertsSeverity,
  spExtractionSeverity,
} from './boardSeverity';
import type { CalendarEventsBoardData, MailBoardData, MiningTaxBoardData } from './boardData';

function data(overrides: Partial<MiningTaxBoardData> = {}): MiningTaxBoardData {
  return {
    unpaidIsk: 0,
    payeeCount: 0,
    unassignedCount: 0,
    oldestUnpaidDays: null,
    needsReauth: false,
    fetchedAt: null,
    characterCount: 1,
    ...overrides,
  };
}

describe('miningTaxSeverity', () => {
  it('is null until the snapshot lands', () => {
    expect(miningTaxSeverity(null)).toBeNull();
  });

  it('keeps a lapsed grant at warning', () => {
    expect(miningTaxSeverity(data({ needsReauth: true }))).toBe('warning');
  });

  it('is only watch while unpaid tax is younger than the threshold', () => {
    const fresh = data({
      unpaidIsk: 1,
      payeeCount: 1,
      oldestUnpaidDays: MINING_TAX_WARNING_DAYS - 1,
    });
    expect(miningTaxSeverity(fresh)).toBe('watch');
  });

  it('ages into warning at the threshold', () => {
    const aged = data({ unpaidIsk: 1, payeeCount: 1, oldestUnpaidDays: MINING_TAX_WARNING_DAYS });
    expect(miningTaxSeverity(aged)).toBe('warning');
    expect(MINING_TAX_WARNING_DAYS).toBe(30);
  });

  it('is watch for unassigned entries and clear when nothing is owed', () => {
    expect(miningTaxSeverity(data({ unassignedCount: 2 }))).toBe('watch');
    expect(miningTaxSeverity(data())).toBe('clear');
  });
});

describe('comingUpSeverity', () => {
  const NOW = Date.parse('2026-01-01T00:00:00Z');
  const data = (hoursAhead: number[], needsReauth = false): CalendarEventsBoardData => ({
    events: hoursAhead.map((hours, i) => ({
      event_id: i,
      event_date: new Date(NOW + hours * 3_600_000).toISOString(),
      title: `Op ${i}`,
      importance: 0,
      event_response: 'accepted',
    })),
    needsReauth,
    fetchedAt: null,
  });

  it('is null until the calendar has loaded', () => {
    expect(comingUpSeverity(null, NOW)).toBeNull();
  });

  it('is watch when a committed event starts within a day — a plan, not a problem', () => {
    expect(comingUpSeverity(data([5, 48]), NOW)).toBe('watch');
  });

  it('is clear when the next event is further out, or there is none', () => {
    expect(comingUpSeverity(data([48]), NOW)).toBe('clear');
    expect(comingUpSeverity(data([]), NOW)).toBe('clear');
  });

  it('is warning when the calendar cannot be read', () => {
    expect(comingUpSeverity(data([], true), NOW)).toBe('warning');
  });
});

describe('spExtractionSeverity', () => {
  const FLOOR = 5_000_000;
  const data = (totalSp: number | null, monitoring = true, thresholdSp = 500_000) => ({
    totalSp,
    monitoring,
    thresholdSp,
  });

  it('is null until the SP total has loaded', () => {
    expect(spExtractionSeverity(data(null))).toBeNull();
  });

  it('is watch once the spare SP reaches the threshold', () => {
    expect(spExtractionSeverity(data(FLOOR + 600_000))).toBe('watch');
    expect(spExtractionSeverity(data(FLOOR + 400_000))).toBe('clear');
  });

  it('never flags anything while monitoring is switched off', () => {
    expect(spExtractionSeverity(data(FLOOR + 9_000_000, false))).toBe('clear');
  });
});

describe('mailSeverity', () => {
  const data = (unread: number, needsReauth = false): MailBoardData => ({
    unread,
    recent: [],
    needsReauth,
    fetchedAt: null,
  });

  it('is null until the mailbox has loaded', () => {
    expect(mailSeverity(null)).toBeNull();
  });

  it('is watch with anything unread, clear with nothing', () => {
    expect(mailSeverity(data(3))).toBe('watch');
    expect(mailSeverity(data(0))).toBe('clear');
  });

  it('is warning when the mailbox cannot be read', () => {
    expect(mailSeverity(data(0, true))).toBe('warning');
  });
});

describe('priceAlertsSeverity', () => {
  const alert = (crossed: boolean) => ({
    typeId: 1,
    name: 'Tritanium',
    targetPrice: 5,
    direction: 'above' as const,
    price: crossed ? 6 : 4,
    crossed,
  });

  it('is null until loaded, warning once a target is crossed, clear otherwise', () => {
    expect(priceAlertsSeverity(null)).toBeNull();
    expect(priceAlertsSeverity({ alerts: [alert(false), alert(true)], checkedAt: 0 })).toBe(
      'warning'
    );
    expect(priceAlertsSeverity({ alerts: [alert(false)], checkedAt: 0 })).toBe('clear');
    expect(priceAlertsSeverity({ alerts: [], checkedAt: null })).toBe('clear');
  });
});
