import { afterAll, describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { WeekStart } from '@/lib/calendarGrid';
import { classifySkillQueue } from '@/engine/skills/queueStatus';
import { buildQueueView, heroProgress, heroSpPerHour } from './queueView';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

function entry(position: number, endDays: number, startDays: number | null = null) {
  return {
    skill_id: 3300 + position,
    queue_position: position,
    finished_level: 5,
    start_date: at(startDays ?? Math.max(endDays - 1, -1)),
    finish_date: at(endDays),
  } satisfies SkillQueueEntry;
}

const view = (entries: SkillQueueEntry[], weekStart: WeekStart = 'monday') =>
  buildQueueView(classifySkillQueue(entries, NOW), NOW, weekStart);

describe('buildQueueView', () => {
  it('takes the first still-training row as the hero and leaves it out of the groups', () => {
    const v = view([entry(0, 8), entry(1, 15)]);
    expect(v.hero?.entry.queue_position).toBe(0);
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.entry.queue_position))).toEqual([1]);
  });

  it('buckets by finish date: this week, this month, then one group per calendar month', () => {
    // NOW is Wed 2026-10-14: day 3 is Sat the 17th (in-week), 10 is later in October,
    // 20 is Nov 3, 50 is Dec 3, 80 is Jan 2.
    const v = view([
      entry(0, 1),
      entry(1, 3),
      entry(2, 10),
      entry(3, 20),
      entry(4, 50),
      entry(5, 80),
    ]);
    expect(v.groups.map((g) => g.id)).toEqual(['week', 'month', '2026-11', '2026-12', '2027-01']);
    expect(v.groups.map((g) => g.rows.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("ends this week where the next one starts, per the pilot's week-start setting", () => {
    // Sun the 18th: still this week when weeks start Monday, next week's
    // first day (so rest of October) when they start Sunday.
    const rows = [entry(0, 1), entry(1, 4)];
    expect(view(rows, 'monday').groups.map((g) => g.id)).toEqual(['week']);
    expect(view(rows, 'sunday').groups.map((g) => g.id)).toEqual(['month']);
  });

  it('is not inflated by finished rows listed ahead of the active ones', () => {
    const v = view([entry(0, -3), entry(1, 2), entry(2, 5)]);
    expect(v.hero?.entry.queue_position).toBe(1);
    expect(v.totalSeconds).toBeCloseTo(5 * 86_400, 0);
  });

  it('skips empty buckets', () => {
    const v = view([entry(0, 1), entry(1, 100)]);
    expect(v.groups.map((g) => g.id)).toEqual(['2027-01']);
  });

  it("totals a group as the time it adds to the queue, not the last row's finish", () => {
    const v = view([entry(0, 1), entry(1, 10), entry(2, 12), entry(3, 40)]);
    const month = v.groups.find((g) => g.id === 'month');
    const nov = v.groups.find((g) => g.id === '2026-11');
    expect(month?.totalSeconds).toBeCloseTo(11 * 86_400, 0);
    expect(nov?.totalSeconds).toBeCloseTo(28 * 86_400, 0);
  });

  it('reports the whole queue length and end', () => {
    const v = view([entry(0, 1), entry(1, 30)]);
    expect(v.totalSeconds).toBeCloseTo(30 * 86_400, 0);
    expect(v.skillCount).toBe(2);
  });

  it('keeps finished rows apart, with no hero when everything is done', () => {
    const v = view([entry(0, -2), entry(1, -1)]);
    expect(v.hero).toBeNull();
    expect(v.finished).toHaveLength(2);
    expect(v.groups).toEqual([]);
    expect(v.totalSeconds).toBe(0);
  });

  it('puts a paused queue (no dates) in the undated list with no hero', () => {
    const paused: SkillQueueEntry[] = [
      { skill_id: 1, queue_position: 0, finished_level: 3 },
      { skill_id: 2, queue_position: 1, finished_level: 4 },
    ];
    const v = view(paused);
    expect(v.hero).toBeNull();
    expect(v.undated).toHaveLength(2);
    expect(v.groups).toEqual([]);
  });

  it('counts only skills still ahead, not finished ones', () => {
    expect(view([entry(0, -1), entry(1, 2), entry(2, 4)]).skillCount).toBe(2);
  });
});

describe('heroProgress', () => {
  it("is the elapsed share of the level's own start..finish window", () => {
    const e = entry(0, 1, -1);
    expect(heroProgress(e, NOW)).toBeCloseTo(0.5, 2);
  });

  it("is the share of the whole level's SP when ESI gives the SP span", () => {
    // Window is half elapsed, but the level began mid-way: 400k of 1M at the
    // window start, 1M at the end -> 700k now, i.e. 70% of the level.
    const e: SkillQueueEntry = {
      ...entry(0, 1, -1),
      level_start_sp: 0,
      training_start_sp: 400_000,
      level_end_sp: 1_000_000,
    };
    expect(heroProgress(e, NOW)).toBeCloseTo(0.7, 2);
  });

  it('clamps to 0..1', () => {
    expect(heroProgress(entry(0, 1, 0.5), NOW)).toBe(0);
    expect(heroProgress(entry(0, -1, -2), NOW)).toBe(1);
  });

  it('is null with no dates (paused)', () => {
    expect(heroProgress({ skill_id: 1, queue_position: 0, finished_level: 1 }, NOW)).toBeNull();
  });
});

describe('heroSpPerHour', () => {
  it("is the level's own SP over its own window, straight from ESI", () => {
    const e: SkillQueueEntry = {
      ...entry(0, 1, -1),
      training_start_sp: 1000,
      level_end_sp: 1000 + 2 * 24 * 1800,
    };
    expect(heroSpPerHour(e)).toBeCloseTo(1800, 3);
  });

  it('is null when ESI left out the SP fields or the window is empty', () => {
    expect(heroSpPerHour(entry(0, 1, -1))).toBeNull();
    expect(heroSpPerHour({ ...entry(0, 1, 1), training_start_sp: 1, level_end_sp: 2 })).toBeNull();
  });
});

describe('buildQueueView on the EVE clock', () => {
  // 2026-10-17T03:00Z is Fri the 16th in Los Angeles but Sat the 17th in UTC;
  // "now" is Sun 2026-10-18T20:00Z (Sun the 18th UTC, Sun the 18th LA 13:00).
  const run = (finishIso: string, nowIso: string, tz?: 'UTC', weekStart: WeekStart = 'monday') => {
    const now = Date.parse(nowIso);
    const e = {
      skill_id: 3301,
      queue_position: 1,
      finished_level: 5,
      start_date: new Date(now).toISOString(),
      finish_date: finishIso,
    } satisfies SkillQueueEntry;
    const hero = {
      ...e,
      skill_id: 3300,
      queue_position: 0,
      finish_date: new Date(now + 1000).toISOString(),
    };
    return buildQueueView(classifySkillQueue([hero, e], now), now, weekStart, tz).groups.map(
      (g) => g.id
    );
  };

  it('files a level under the month its UTC date falls in, not the local one', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 2026-12-01T03:00Z is Nov 30 in LA (local: November) and Dec 1 in UTC.
    const finish = '2026-12-01T03:00:00Z';
    const now = '2026-10-14T12:00:00Z';
    expect(run(finish, now)).toEqual(['2026-11']);
    expect(run(finish, now, 'UTC')).toEqual(['2026-12']);
  });

  it('closes the week at the UTC week boundary on the EVE clock', () => {
    process.env.TZ = 'America/Los_Angeles';
    // Now Wed 2026-10-14. Monday weeks end at 2026-10-19 00:00 on the chosen clock.
    // 2026-10-19T03:00Z is still Sun the 18th in LA (this week) but Mon the 19th in UTC.
    const finish = '2026-10-19T03:00:00Z';
    const now = '2026-10-14T12:00:00Z';
    expect(run(finish, now)).toEqual(['week']);
    expect(run(finish, now, 'UTC')).toEqual(['month']);
  });

  it('reads "this month" on the chosen clock too', () => {
    process.env.TZ = 'America/Los_Angeles';
    // Now 2026-11-01T03:00Z is Oct 31 in LA but Nov 1 in UTC; a Nov 20 finish is "this month" only on UTC.
    const now = '2026-11-01T03:00:00Z';
    const finish = '2026-11-20T12:00:00Z';
    expect(run(finish, now)).toEqual(['2026-11']);
    expect(run(finish, now, 'UTC')).toEqual(['month']);
  });
});

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});
