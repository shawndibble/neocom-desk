import { describe, expect, it } from 'vitest';
import type { JournalRow } from '../journalNetting';
import { cashFlow } from './cashFlow';

let id = 0;
const line = (date: string, amount: number, o: Partial<JournalRow> = {}): JournalRow => ({
  id: ++id,
  date: `${date}T12:00:00Z`,
  ref_type: 'bounty_prize',
  description: '',
  amount,
  balance: 0,
  ...o,
});

describe('cashFlow', () => {
  it('sums earned, spent and net over the window and gives a per-day average', () => {
    const rows = [
      line('2026-10-31', 600),
      line('2026-10-30', -200),
      line('2026-10-25', 400),
      line('2026-10-24', 999), // 8 days back: outside a 7-day window
    ];
    const flow = cashFlow(rows, 7, '2026-10-31');
    expect(flow).toMatchObject({ earned: 1000, spent: 200, net: 800 });
    expect(flow.perDay).toBeCloseTo(1000 / 7);
    expect(flow.days).toHaveLength(7);
    expect(flow.days[flow.days.length - 1]).toMatchObject({ day: '2026-10-31', net: 600 });
  });

  it("leaves out transfers between the pilot's own Characters", () => {
    const rows = [line('2026-10-31', 500), line('2026-10-31', 9000, { internal: true })];
    expect(cashFlow(rows, 7, '2026-10-31')).toMatchObject({ earned: 500, spent: 0 });
  });

  it('compares earned with the window before when the history reaches that far back', () => {
    const rows = [line('2026-10-01', 100), line('2026-10-20', 150), line('2026-10-28', 300)];
    // 7-day windows: 10-25..10-31 earned 300; 10-18..10-24 earned 150.
    const flow = cashFlow(rows, 7, '2026-10-31');
    expect(flow.earnedBefore).toBe(150);
    expect(flow.partial).toBe(false);
  });

  it('flags a window the history does not fully cover, and gives no comparison', () => {
    const rows = [line('2026-10-26', 100), line('2026-10-30', 100)];
    const flow = cashFlow(rows, 7, '2026-10-31');
    expect(flow.partial).toBe(true);
    expect(flow.earnedBefore).toBeNull();
    expect(flow.coveredFrom).toBe('2026-10-26');
  });

  it('judges coverage by the Character whose history is shortest', () => {
    const rows = [
      line('2026-08-01', 10, { characterId: 1 }),
      line('2026-10-28', 10, { characterId: 1 }),
      line('2026-10-25', 10, { characterId: 2 }),
    ];
    const flow = cashFlow(rows, 30, '2026-10-31');
    expect(flow.coveredFrom).toBe('2026-10-25');
    expect(flow.partial).toBe(true);
    expect(flow.earnedBefore).toBeNull();
  });

  it('is all zeros, not partial-flagged, with no lines at all', () => {
    expect(cashFlow([], 30, '2026-10-31')).toMatchObject({
      earned: 0,
      spent: 0,
      net: 0,
      coveredFrom: null,
      earnedBefore: null,
    });
  });
});
