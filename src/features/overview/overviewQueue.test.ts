import { describe, it, expect } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { selectActiveEntryFromSorted, selectUpcomingEntries } from './overviewQueue';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const HOUR = 3_600_000;

function entry(position: number, startH: number, finishH: number): SkillQueueEntry {
  return {
    skill_id: 3300 + position,
    queue_position: position,
    finished_level: 5,
    start_date: new Date(NOW + startH * HOUR).toISOString(),
    finish_date: new Date(NOW + finishH * HOUR).toISOString(),
  };
}

/** An active entry at position 0, then `n` queued behind it. */
function queue(n: number): SkillQueueEntry[] {
  return Array.from({ length: n + 1 }, (_, i) => entry(i, i * 10 - 1, i * 10 + 9));
}

describe('selectUpcomingEntries', () => {
  const upcomingOf = (n: number) => {
    const q = queue(n);
    return selectUpcomingEntries(q, selectActiveEntryFromSorted(q, NOW), NOW);
  };

  it('is empty when nothing is queued behind the active skill', () => {
    expect(upcomingOf(0)).toEqual({ upcoming: [], more: 0 });
  });

  it('lists a single queued skill', () => {
    const { upcoming, more } = upcomingOf(1);
    expect(upcoming.map((e) => e.queue_position)).toEqual([1]);
    expect(more).toBe(0);
  });

  it('lists exactly three with nothing more', () => {
    const { upcoming, more } = upcomingOf(3);
    expect(upcoming.map((e) => e.queue_position)).toEqual([1, 2, 3]);
    expect(more).toBe(0);
  });

  it('caps at three and counts the rest', () => {
    const { upcoming, more } = upcomingOf(10);
    expect(upcoming.map((e) => e.queue_position)).toEqual([1, 2, 3]);
    expect(more).toBe(7);
  });

  it('is empty when nothing is training', () => {
    expect(selectUpcomingEntries(queue(2), null, NOW)).toEqual({ upcoming: [], more: 0 });
  });

  it('skips entries that already finished', () => {
    const q = [entry(0, -30, -20), entry(1, -1, 5), entry(2, 5, 9)];
    const active = selectActiveEntryFromSorted(q, NOW);
    expect(selectUpcomingEntries(q, active, NOW).upcoming.map((e) => e.queue_position)).toEqual([
      2,
    ]);
  });
});
