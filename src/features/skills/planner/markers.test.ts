import { describe, it, expect } from 'vitest';
import type { AttributeName, Attributes, EngineSkill, PlanEntry } from '@/engine/types';
import type { RemapSegment } from '@/engine/optimizer';
import {
  addMarker,
  buildRows,
  markerRowId,
  markersAfterEntryRemoval,
  markerStepIndices,
  normalizeMarkers,
  removeMarker,
  reorderRows,
  segmentsToMarkers,
} from './markers';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

const skill = (
  typeID: number,
  primary: AttributeName = 'perception',
  secondary: AttributeName = 'willpower',
  prereqs: EngineSkill['prereqs'] = []
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank: 1, primary, secondary, prereqs });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const ATTRS: Attributes = {
  intelligence: 17,
  memory: 17,
  perception: 27,
  willpower: 21,
  charisma: 17,
};

const seg = (startIndex: number, endIndex: number, remap = true): RemapSegment => ({
  startIndex,
  endIndex,
  attributes: ATTRS,
  seconds: 0,
  remap,
});

describe('normalizeMarkers', () => {
  it('clamps to [0, entryCount], sorts, and dedupes', () => {
    expect(normalizeMarkers([5, -2, 1, 1, 0], 3)).toEqual([0, 1, 3]);
    expect(normalizeMarkers([], 3)).toEqual([]);
    expect(normalizeMarkers(undefined, 3)).toEqual([]);
  });
});

describe('buildRows', () => {
  it('interleaves marker rows before the entry at their position', () => {
    const entries = [entry(1), entry(2), entry(3)];
    const rows = buildRows(entries, [1, 3]);
    expect(rows.map((r) => r.id)).toEqual(['1', markerRowId(0), '2', '3', markerRowId(1)]);
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'marker', 'entry', 'entry', 'marker']);
  });

  it('puts a position-0 marker first', () => {
    const rows = buildRows([entry(1)], [0]);
    expect(rows.map((r) => r.kind)).toEqual(['marker', 'entry']);
  });
});

describe('reorderRows', () => {
  const entries = [entry(1), entry(2), entry(3)];

  it('moves an entry across a marker and recomputes marker positions', () => {
    // Rows: [e1, M0@1, e2, e3]. Drag e3 onto e1: [e3, e1, M0, e2].
    const result = reorderRows(entries, [1], '3', '1');
    expect(result.entries.map((e) => e.skillTypeID)).toEqual([3, 1, 2]);
    expect(result.markers).toEqual([2]);
  });

  it('moves a marker onto an entry row', () => {
    // Rows: [e1, M0@1, e2, e3]. Drag M0 onto e3: [e1, e2, e3, M0] -> position 3.
    const result = reorderRows(entries, [1], markerRowId(0), '3');
    expect(result.entries.map((e) => e.skillTypeID)).toEqual([1, 2, 3]);
    expect(result.markers).toEqual([3]);
  });

  it('returns the input unchanged for unknown ids', () => {
    const result = reorderRows(entries, [1], 'nope', '1');
    expect(result.entries).toEqual(entries);
    expect(result.markers).toEqual([1]);
  });

  it('preserves fields beyond skillTypeID and targetLevel on every entry', () => {
    const withExtra: PlanEntry[] = [
      { skillTypeID: 1, targetLevel: 1, priority: 'high' },
      { skillTypeID: 2, targetLevel: 1, priority: 'low' },
      { skillTypeID: 3, targetLevel: 1, priority: 'normal' },
    ];
    const result = reorderRows(withExtra, [], '3', '1');
    expect(result.entries).toEqual([
      { skillTypeID: 3, targetLevel: 1, priority: 'normal' },
      { skillTypeID: 1, targetLevel: 1, priority: 'high' },
      { skillTypeID: 2, targetLevel: 1, priority: 'low' },
    ]);
  });
});

describe('addMarker / removeMarker', () => {
  it('adds a marker after the last entry, deduped', () => {
    expect(addMarker([], 3)).toEqual([3]);
    expect(addMarker([1], 3)).toEqual([1, 3]);
    expect(addMarker([3], 3)).toEqual([3]);
  });

  it('removes the marker at the given normalized index', () => {
    expect(removeMarker([3, 1], 0, 3)).toEqual([3]);
    expect(removeMarker([3, 1], 1, 3)).toEqual([1]);
  });
});

describe('markersAfterEntryRemoval', () => {
  it('shifts markers after the removed entry left by one', () => {
    // 3 entries, markers before entries[1] and after the last entry.
    expect(markersAfterEntryRemoval([1, 3], 0, 3)).toEqual([0, 2]);
    expect(markersAfterEntryRemoval([1, 3], 2, 3)).toEqual([1, 2]);
  });

  it('keeps markers at or before the removed index in place', () => {
    expect(markersAfterEntryRemoval([1], 1, 3)).toEqual([1]);
  });

  it('is a clamped no-op when the entry was not found', () => {
    expect(markersAfterEntryRemoval([1, 9], -1, 3)).toEqual([1, 3]);
  });
});

describe('markerStepIndices', () => {
  it('maps an entry-list position to the scheduled step prefix length', () => {
    // Entry 2 requires skill 1 at level 3: entries [e2@1, e3@1] expand to
    // steps [1-I, 1-II, 1-III, 2-I, 3-I].
    const skills = skillMap(
      skill(1),
      skill(2, 'perception', 'willpower', [{ typeID: 1, level: 3 }]),
      skill(3, 'intelligence', 'memory')
    );
    const entries = [entry(2), entry(3)];
    expect(markerStepIndices(entries, [0, 1, 2], skills, new Map())).toEqual([0, 4, 5]);
  });

  it('skips already-trained levels like the computed queue does', () => {
    const skills = skillMap(skill(1), skill(3, 'intelligence', 'memory'));
    const trained = new Map([[1, { level: 2, sp: 1415 }]]);
    // Entry 1 targets III but I/II are trained: only one step before the marker.
    expect(markerStepIndices([entry(1, 3), entry(3)], [1], skills, trained)).toEqual([1]);
  });

  it('ignores entries whose skill is missing from the catalog, matching the computed queue', () => {
    const skills = skillMap(skill(1), skill(3, 'intelligence', 'memory'));
    // Entry 99 is unknown; it contributes no steps.
    expect(markerStepIndices([entry(99), entry(1), entry(3)], [1, 2], skills, new Map())).toEqual([
      0, 1,
    ]);
  });
});

describe('segmentsToMarkers', () => {
  it('places one marker per remapped segment at the entry it starts', () => {
    const skills = skillMap(skill(1), skill(2), skill(3));
    const entries = [entry(1), entry(2), entry(3)];
    // Steps [1, 2, 3], one per entry: segment starts line up with entry boundaries exactly.
    const segments = [seg(0, 0), seg(1, 1), seg(2, 2)];
    expect(segmentsToMarkers(entries, segments, skills, new Map())).toEqual([0, 1, 2]);
  });

  it('ignores the leading current-attributes segment', () => {
    const skills = skillMap(skill(1), skill(2), skill(3));
    const entries = [entry(1), entry(2), entry(3)];
    const segments = [seg(0, 0, false), seg(1, 2, true)];
    expect(segmentsToMarkers(entries, segments, skills, new Map())).toEqual([1]);
  });

  it('skips entries whose skill is missing from the catalog when placing the marker', () => {
    const skills = skillMap(skill(1), skill(2));
    // Entry 99 is unknown and contributes no step; the first real step is entry 1's.
    const entries = [entry(99), entry(1), entry(2)];
    const segments = [seg(0, 0)];
    expect(segmentsToMarkers(entries, segments, skills, new Map())).toEqual([1]);
  });

  it('skips an already-trained entry that contributes no step', () => {
    const skills = skillMap(skill(1), skill(3, 'intelligence', 'memory'));
    const trained = new Map([[1, { level: 3, sp: 1415 }]]);
    // Entry 1 is fully trained already (targets III, already III): 0 steps.
    // Entry 3 contributes the plan's only step.
    const entries = [entry(1, 3), entry(3)];
    const segments = [seg(0, 0)];
    expect(segmentsToMarkers(entries, segments, skills, trained)).toEqual([1]);
  });

  it('collapses a segment boundary that falls inside one entry (prereq expansion) to before that entry', () => {
    // Entry 2 requires skill 1 (a different attribute pair) as a prereq, so
    // it alone expands to two steps: [1-I, 2-I]. A segment boundary between
    // them cannot be represented as an entry-list position without splitting
    // the entry, so it snaps to before the whole entry.
    const skills = skillMap(
      skill(1, 'intelligence', 'memory'),
      skill(2, 'perception', 'willpower', [{ typeID: 1, level: 1 }])
    );
    const entries = [entry(2)];
    const segments = [seg(0, 0), seg(1, 1)];
    expect(segmentsToMarkers(entries, segments, skills, new Map())).toEqual([0]);
  });

  it('returns no markers for no remapped segments', () => {
    expect(segmentsToMarkers([], [], new Map(), new Map())).toEqual([]);
    const skills = skillMap(skill(1));
    expect(segmentsToMarkers([entry(1)], [seg(0, 0, false)], skills, new Map())).toEqual([]);
  });
});
