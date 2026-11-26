import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import { occurrenceKey } from '../occurrenceKey';
import { projectSharedMoonPops, type PushCopy } from '../projection';
import {
  diffSharedMoonPop,
  sharedMoonPopPath,
  sharedPopIdOfOccurrenceKey,
  type SharedMoonPopEntrySnapshot,
  type SharedMoonPopFire,
} from './sharedMoonPop';

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

const entry = (over: Partial<SharedMoonPopEntrySnapshot> = {}): SharedMoonPopEntrySnapshot => ({
  popId: '98000001_1035000000000_1762900000000',
  corporationId: 98000001,
  refineryName: 'Efa - Moon Drill',
  popTime: 'ready',
  popAtMs: NOW + 2 * HOUR_MS,
  ratePct: 10,
  leadMs: 0,
  ...over,
});

const copy: PushCopy<SharedMoonPopFire, { corporation?: string; when?: string }> = (
  fire,
  _character,
  names
) => ({
  title: `Moon pop · ${fire.refineryName ?? '?'}`,
  body: `${fire.popTime} at ${names.when ?? '?'} · taxed by ${names.corporation ?? '?'} · ${fire.ratePct}%`,
});

describe('diffSharedMoonPop', () => {
  it('fires once when the pop time is crossed between two polls', () => {
    const pop = entry({ popAtMs: NOW + 5 * MINUTE_MS });
    const prev = { entries: [pop], nowMs: NOW };
    const next = { entries: [pop], nowMs: NOW + 10 * MINUTE_MS };
    expect(diffSharedMoonPop(7, prev, next)).toEqual([
      {
        eventId: 'sharedMoonPop',
        characterId: 7,
        popId: pop.popId,
        corporationId: pop.corporationId,
        refineryName: pop.refineryName,
        popTime: 'ready',
        popAtMs: pop.popAtMs,
        ratePct: 10,
        thresholdMs: 0,
      },
    ]);
    expect(diffSharedMoonPop(7, next, { entries: [pop], nowMs: NOW + 15 * MINUTE_MS })).toEqual([]);
  });

  it('fires at the lead time before the pop, not at the pop', () => {
    const pop = entry({ popAtMs: NOW + HOUR_MS, leadMs: HOUR_MS - 5 * MINUTE_MS });
    const fires = diffSharedMoonPop(
      7,
      { entries: [pop], nowMs: NOW },
      { entries: [pop], nowMs: NOW + 10 * MINUTE_MS }
    );
    expect(fires).toHaveLength(1);
    expect(fires[0].thresholdMs).toBe(HOUR_MS - 5 * MINUTE_MS);
  });

  it('fires nothing for a muted sharing corporation', () => {
    const pop = entry({ popAtMs: NOW + 5 * MINUTE_MS, muted: true });
    expect(
      diffSharedMoonPop(
        7,
        { entries: [pop], nowMs: NOW },
        { entries: [pop], nowMs: NOW + 10 * MINUTE_MS }
      )
    ).toEqual([]);
  });

  it('fires nothing without a baseline, before the fire time, or long after it', () => {
    const pop = entry({ popAtMs: NOW + 5 * MINUTE_MS });
    expect(diffSharedMoonPop(7, undefined, { entries: [pop], nowMs: NOW + HOUR_MS })).toEqual([]);
    expect(
      diffSharedMoonPop(
        7,
        { entries: [pop], nowMs: NOW },
        { entries: [pop], nowMs: NOW + MINUTE_MS }
      )
    ).toEqual([]);
    expect(
      diffSharedMoonPop(
        7,
        { entries: [pop], nowMs: NOW },
        { entries: [pop], nowMs: NOW + 24 * HOUR_MS }
      )
    ).toEqual([]);
  });
});

describe('diffSharedMoonPop: a chunk fractured early', () => {
  const before = entry({ popTime: 'auto-fracture', popAtMs: NOW + 3 * HOUR_MS });
  const after = entry({ popTime: 'auto-fracture', popAtMs: NOW - 2 * HOUR_MS });

  it('tells the moved Pop Time once, as fractured early, though it is already past', () => {
    const prev = { entries: [before], nowMs: NOW - 10 * MINUTE_MS };
    const next = { entries: [after], nowMs: NOW };
    expect(diffSharedMoonPop(7, prev, next)).toEqual([
      expect.objectContaining({ popId: after.popId, popAtMs: after.popAtMs, early: true }),
    ]);
    expect(diffSharedMoonPop(7, next, { entries: [after], nowMs: NOW + MINUTE_MS })).toEqual([]);
  });

  it('tells it at once when the lead time before the new time is already behind the last poll', () => {
    const led = { ...before, leadMs: HOUR_MS };
    const soon = entry({
      popTime: 'auto-fracture',
      popAtMs: NOW + 20 * MINUTE_MS,
      leadMs: HOUR_MS,
    });
    const fires = diffSharedMoonPop(
      7,
      { entries: [led], nowMs: NOW - MINUTE_MS },
      { entries: [soon], nowMs: NOW }
    );
    expect(fires).toEqual([expect.objectContaining({ popAtMs: soon.popAtMs })]);
    expect(fires[0].early).toBeUndefined();
  });

  it('tells it at the new time when that is still ahead of this poll', () => {
    const soon = entry({ popTime: 'auto-fracture', popAtMs: NOW + 5 * MINUTE_MS });
    const prev = { entries: [before], nowMs: NOW };
    expect(diffSharedMoonPop(7, prev, { entries: [soon], nowMs: NOW + MINUTE_MS })).toEqual([]);
    expect(
      diffSharedMoonPop(
        7,
        { entries: [soon], nowMs: NOW + MINUTE_MS },
        { entries: [soon], nowMs: NOW + 10 * MINUTE_MS }
      )
    ).toEqual([expect.objectContaining({ popAtMs: soon.popAtMs })]);
  });

  it('stays quiet for a muted corporation, or a time moved back too far to be news', () => {
    const prev = { entries: [before], nowMs: NOW - 10 * MINUTE_MS };
    expect(
      diffSharedMoonPop(7, prev, { entries: [{ ...after, muted: true }], nowMs: NOW })
    ).toEqual([]);
    const longAgo = entry({ popTime: 'auto-fracture', popAtMs: NOW - 13 * HOUR_MS });
    expect(diffSharedMoonPop(7, prev, { entries: [longAgo], nowMs: NOW })).toEqual([]);
  });
});

describe('projectSharedMoonPops', () => {
  const names = { corporations: new Map([[98000001, 'Moon Collectors']]), when: () => '14:00' };
  const project = (
    entries: Parameters<typeof projectSharedMoonPops>[0]['entries'],
    mutedCorporationIds: ReadonlySet<number> = new Set()
  ) =>
    projectSharedMoonPops({
      characterId: 7,
      characterName: 'Kestrel',
      entries,
      mutedCorporationIds,
      names,
      copy,
      nowMs: NOW,
    });

  it('projects one row at the pop time minus the lead time, with the deep-linkable key', () => {
    const pop = entry({ leadMs: 30 * MINUTE_MS });
    const rows = project([pop]);
    expect(rows).toEqual([
      {
        characterId: 7,
        eventId: 'sharedMoonPop',
        occurrenceKey: `sharedMoonPop:${pop.popId}:${pop.popAtMs}:${30 * MINUTE_MS}`,
        fireAt: pop.popAtMs - 30 * MINUTE_MS,
        title: 'Moon pop · Efa - Moon Drill',
        body: 'ready at 14:00 · taxed by Moon Collectors · 10%',
      },
    ]);
    expect(sharedPopIdOfOccurrenceKey(rows[0].occurrenceKey)).toBe(pop.popId);
  });

  it('projects nothing for a muted sharing corporation', () => {
    expect(project([entry()], new Set([98000001]))).toEqual([]);
  });

  it('projects nothing already past or beyond the horizon', () => {
    const past = entry({ popAtMs: NOW - MINUTE_MS });
    const far = entry({ popAtMs: NOW + 100 * HOUR_MS });
    expect(project([past, far])).toEqual([]);
  });

  it('keys the occurrence without the Character, so two Characters share one push', () => {
    const fire = diffSharedMoonPop(
      7,
      { entries: [entry({ popAtMs: NOW + MINUTE_MS })], nowMs: NOW },
      { entries: [entry({ popAtMs: NOW + MINUTE_MS })], nowMs: NOW + 2 * MINUTE_MS }
    )[0];
    expect(occurrenceKey(fire, NOW)).toBe(occurrenceKey({ ...fire, characterId: 8 }, NOW));
  });
});

describe('sharedMoonPopPath', () => {
  it('opens the pop on the Calendar', () => {
    expect(sharedMoonPopPath('98000001_1_2')).toBe('/calendar?pop=98000001_1_2');
  });

  it('reads no pop id out of another event’s key', () => {
    expect(sharedPopIdOfOccurrenceKey('7:acceleratorExpiring:1:2')).toBeUndefined();
  });
});
