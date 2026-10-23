import { describe, expect, it } from 'vitest';
import { diffSkyhookRaidable, type SkyhookEntrySnapshot, type SkyhookSnapshot } from './skyhooks';

const HOUR = 3_600_000;
const NOW = 1_000_000_000_000;

function hook(overrides: Partial<SkyhookEntrySnapshot> = {}): SkyhookEntrySnapshot {
  return {
    skyhookId: 1,
    planetId: 40_000_001,
    windowStartMs: NOW + 10 * HOUR,
    windowEndMs: NOW + 14 * HOUR,
    unsecuredUnits: 500,
    leadMs: 2 * HOUR,
    minUnits: 0,
    ...overrides,
  };
}

const snap = (nowMs: number, ...entries: SkyhookEntrySnapshot[]): SkyhookSnapshot => ({
  entries,
  nowMs,
});

describe('diffSkyhookRaidable', () => {
  it('fires nothing without a baseline', () => {
    const next = snap(NOW + 9 * HOUR, hook());
    expect(diffSkyhookRaidable(7, undefined, next)).toEqual([]);
  });

  it('fires "soon" once when the window opening enters the lead time', () => {
    const before = snap(NOW + 7 * HOUR, hook());
    const inside = snap(NOW + 8.5 * HOUR, hook());
    const later = snap(NOW + 9 * HOUR, hook());
    const fires = diffSkyhookRaidable(7, before, inside);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toMatchObject({ phase: 'soon', skyhookId: 1, thresholdMs: 2 * HOUR });
    expect(diffSkyhookRaidable(7, inside, later)).toEqual([]);
  });

  it('re-fires "soon" for a new window, and when a raised lead time re-crosses', () => {
    const before = snap(NOW + 7 * HOUR, hook({ leadMs: HOUR }));
    const raised = snap(NOW + 8.5 * HOUR, hook({ leadMs: 2 * HOUR }));
    expect(diffSkyhookRaidable(7, before, raised)).toHaveLength(1);
    const moved = snap(NOW + 8.6 * HOUR, hook({ windowStartMs: NOW + 20 * HOUR }));
    expect(diffSkyhookRaidable(7, raised, moved)).toEqual([]);
  });

  it('fires "danger" when the window opens with silo at or above the threshold', () => {
    const before = snap(NOW + 9 * HOUR, hook({ minUnits: 100 }));
    const open = snap(NOW + 10.5 * HOUR, hook({ minUnits: 100, unsecuredUnits: 100 }));
    const fires = diffSkyhookRaidable(7, before, open);
    expect(fires.map((f) => f.phase)).toEqual(['danger']);
    expect(fires[0].unsecuredUnits).toBe(100);
  });

  it('fires a plain "open" when the silo is below the threshold', () => {
    const before = snap(NOW + 9 * HOUR, hook({ minUnits: 1000 }));
    const open = snap(NOW + 10.5 * HOUR, hook({ minUnits: 1000, unsecuredUnits: 999 }));
    expect(diffSkyhookRaidable(7, before, open).map((f) => f.phase)).toEqual(['open']);
  });

  it('treats an unread silo as above the threshold, never safe', () => {
    const before = snap(NOW + 9 * HOUR, hook({ minUnits: 1000 }));
    const open = snap(NOW + 10.5 * HOUR, hook({ minUnits: 1000, unsecuredUnits: null }));
    expect(diffSkyhookRaidable(7, before, open).map((f) => f.phase)).toEqual(['danger']);
  });

  it('fires the opening once, not on every poll while the window is open', () => {
    const a = snap(NOW + 10.5 * HOUR, hook());
    const b = snap(NOW + 11 * HOUR, hook());
    expect(diffSkyhookRaidable(7, a, b)).toEqual([]);
  });

  it('fires for a skyhook new to the poll that is already open', () => {
    const before = snap(NOW + 9 * HOUR);
    const open = snap(NOW + 10.5 * HOUR, hook());
    expect(diffSkyhookRaidable(7, before, open).map((f) => f.phase)).toEqual(['danger']);
  });

  it('ignores skyhooks with no window and windows already closed', () => {
    const before = snap(NOW, hook({ windowStartMs: null, windowEndMs: null }));
    const later = snap(
      NOW + 20 * HOUR,
      hook({ windowStartMs: null, windowEndMs: null }),
      hook({ skyhookId: 2 })
    );
    expect(diffSkyhookRaidable(7, before, later)).toEqual([]);
  });
});
