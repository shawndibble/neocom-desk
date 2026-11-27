import { describe, expect, it } from 'vitest';
import {
  MINING_TAX_WARNING_DAYS,
  comingUpEventSeverity,
  mailSeverity,
  miningTaxSeverity,
  priceAlertsSeverity,
  spExtractionSeverity,
} from './boardSeverity';
import type { MailBoardData, MiningTaxBoardData } from './boardData';

function data(overrides: Partial<MiningTaxBoardData> = {}): MiningTaxBoardData {
  return {
    unpaidIsk: 0,
    payeeCount: 0,
    unassignedCount: 0,
    oldestUnpaidDays: null,
    needsReauth: false,
    fetchedAt: null,
    characterCount: 1,
    missingCharacterNames: [],
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

describe('comingUpEventSeverity', () => {
  const now = 1_000_000_000;
  const hour = 3_600_000;

  it('follows the default ladder: red inside 1h, amber inside 24h, else clear', () => {
    expect(comingUpEventSeverity(now + 30 * 60_000, now)).toBe('critical');
    expect(comingUpEventSeverity(now + 5 * hour, now)).toBe('warning');
    expect(comingUpEventSeverity(now + 30 * hour, now)).toBe('clear');
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

  it('is clear whether or not anything is unread', () => {
    expect(mailSeverity(data(3))).toBe('clear');
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
