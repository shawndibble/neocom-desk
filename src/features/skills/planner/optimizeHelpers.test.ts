import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from 'i18next';
import { formatCountdown } from '@/lib/duration';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import type { PlaceRemapsResult } from '@/engine/optimizer';
import type { PlanScheduleInputs, SchedulablePlan } from './planSchedule';

const schedulePlanWith = vi.fn();
vi.mock('./planSchedule', () => ({
  schedulePlanWith: (...args: unknown[]) => schedulePlanWith(...args),
}));

const { anchorKeysOf, appendedCountMessage, confirmRemapOutcome, pricedAfterApply } =
  await import('./optimizeHelpers');

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as unknown as TFunction;

beforeEach(() => schedulePlanWith.mockReset());

describe('appendedCountMessage', () => {
  const trained = new Map<number, TrainedSkill>([
    [1, { level: 3 } as TrainedSkill],
    [2, { level: 1 } as TrainedSkill],
  ]);

  it('counts only entries above the trained level', () => {
    const imported: PlanEntry[] = [
      { skillTypeID: 1, targetLevel: 3 }, // already trained
      { skillTypeID: 2, targetLevel: 4 }, // new
      { skillTypeID: 9, targetLevel: 1 }, // untrained skill
    ];
    expect(appendedCountMessage(t, trained, imported)).toBe('plans.importAddedCount:{"count":2}');
  });

  it('says nothing was added when everything is already trained', () => {
    expect(appendedCountMessage(t, trained, [{ skillTypeID: 1, targetLevel: 2 }])).toBe(
      'plans.importAddedNone'
    );
  });
});

describe('confirmRemapOutcome', () => {
  it('reports the saving for a saves verdict', () => {
    expect(confirmRemapOutcome(t, { kind: 'saves', savingsSeconds: 3600 })).toBe(
      `plans.optimizeConfirmSaves:${JSON.stringify({ duration: formatCountdown(3600) })}`
    );
  });

  it('appends the yearly-remap date note when the timed slot was used', () => {
    const out = confirmRemapOutcome(
      t,
      { kind: 'saves', savingsSeconds: 3600 },
      new Date(2026, 5, 1)
    );
    expect(out).toMatch(
      new RegExp(
        `^plans\\.optimizeConfirmSaves:.*"${formatCountdown(3600)}".*\\. plans\\.optimizeConfirmYearlyAfter:`
      )
    );
  });

  it('explains the no-op verdicts instead of claiming no savings', () => {
    expect(confirmRemapOutcome(t, { kind: 'noRemapsAvailable' })).toBe(
      'plans.optimizeConfirmNoRemaps'
    );
    expect(confirmRemapOutcome(t, { kind: 'markersAtEnd' })).toBe(
      'plans.optimizeConfirmMarkersAtEnd'
    );
    expect(confirmRemapOutcome(t, { kind: 'noGain' })).toBe('plans.optimizeConfirmNoGain');
  });
});

describe('pricedAfterApply', () => {
  const attributes = {
    intelligence: 20,
    memory: 20,
    perception: 20,
    willpower: 20,
    charisma: 19,
  };
  const ctx = {
    schedulablePlan: { entries: [] } as unknown as SchedulablePlan,
    scheduleInputs: {} as PlanScheduleInputs,
    loadedAtMs: 123,
    attributes,
  };

  it('costs the candidate entries/markers with marker overrides cleared', () => {
    schedulePlanWith.mockReturnValue({ scheduled: [], totalSeconds: 0, markersResult: null });
    const entries: PlanEntry[] = [{ skillTypeID: 1, targetLevel: 2 }];
    pricedAfterApply(ctx, entries, [0]);
    expect(schedulePlanWith).toHaveBeenCalledWith(ctx.schedulablePlan, ctx.scheduleInputs, 123, {
      entries,
      markers: [0],
      markerAttributes: [],
    });
  });

  it("returns the schedule's own markers result when it has one", () => {
    const markersResult = { segments: [], savingsSeconds: 5 } as unknown as PlaceRemapsResult;
    const order = [{ skillTypeID: 1, level: 1 }];
    schedulePlanWith.mockReturnValue({ scheduled: order, totalSeconds: 10, markersResult });
    const out = pricedAfterApply(ctx, [], [1]);
    expect(out.order).toBe(order);
    expect(out.remaps).toBe(markersResult);
  });

  it('falls back to one keep-current-attributes segment when every marker was redundant', () => {
    const order = [
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 1, level: 2 },
    ];
    schedulePlanWith.mockReturnValue({ scheduled: order, totalSeconds: 90, markersResult: null });
    const { remaps } = pricedAfterApply(ctx, [], []);
    expect(remaps).toEqual({
      segments: [{ startIndex: 0, endIndex: 1, attributes, seconds: 90, remap: false }],
      totalSeconds: 90,
      currentSeconds: 90,
      savingsSeconds: 0,
    });
  });

  it('has no segments for an empty schedule', () => {
    schedulePlanWith.mockReturnValue({ scheduled: [], totalSeconds: 0, markersResult: null });
    expect(pricedAfterApply(ctx, [], []).remaps.segments).toEqual([]);
  });
});

describe('anchorKeysOf', () => {
  it('maps each segment to the key of its first step, undefined when out of range', () => {
    const segments = [{ startIndex: 0 }, { startIndex: 2 }, { startIndex: 9 }] as never;
    expect(anchorKeysOf(['a', 'b', 'c'] as never, segments)).toEqual(['a', 'c', undefined]);
  });
});
