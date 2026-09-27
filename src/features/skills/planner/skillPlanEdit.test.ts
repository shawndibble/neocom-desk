import { describe, it, expect } from 'vitest';
import { normalizePlanWithBoundaries } from '@/engine/plan';
import type { RemapSegment } from '@/engine/optimizer';
import type {
  Attributes,
  EngineSkill,
  PlanEntry,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';
import { markerRowId } from './markers';
import { prereqRowId } from './planDrop';
import { buildMergedRows, summarizeEntryQueue, type MergedRow } from './queueRows';
import { entryId } from './reorder';
import {
  addEntry,
  addRemapMarker,
  appendImport,
  applyOptimizeForMe,
  applyRemapSegments,
  applyReorder,
  moveRow,
  promotePrereqRow,
  alignedMarkerAttributes,
  removeEntry,
  removeRemapMarker,
  replaceWithImport,
  setPriority,
  setRemapMarkerAttributes,
  splitByLevel,
  type SkillPlanEditable,
} from './skillPlanEdit';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

const A: Attributes = { intelligence: 17, memory: 17, perception: 27, willpower: 21, charisma: 17 };
const B: Attributes = { ...A, perception: 20, willpower: 24 };

/** Three entries (1, 2, 3), plus whatever markers the test gives it. */
const plan = (extra: Partial<SkillPlanEditable> = {}): SkillPlanEditable => ({
  entries: [entry(1), entry(2), entry(3)],
  ...extra,
});

const skill = (typeID: number, prereqs: EngineSkill['prereqs'] = []): EngineSkill => ({
  typeID,
  name: `Skill ${typeID}`,
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs,
});

/** 1, 3 and 4 are free-standing; 2 needs 1 at III. */
const SKILLS = new Map<number, EngineSkill>(
  [skill(1), skill(2, [{ typeID: 1, level: 3 }]), skill(3), skill(4)].map((s) => [s.typeID, s])
);

const NO_TRAINED = new Map<number, TrainedSkill>();

/** The merged row list the Plan Editor hands EntryList, with stand-in times. */
function mergedRows(entries: readonly PlanEntry[], markers?: readonly number[]): MergedRow[] {
  const { steps, entryBoundaries } = normalizePlanWithBoundaries(entries, SKILLS, NO_TRAINED);
  const scheduled: ScheduledStep[] = steps.map((step, i) => ({
    ...step,
    sp: 250,
    seconds: 60,
    cumulativeSeconds: 60 * (i + 1),
  }));
  const queue = summarizeEntryQueue(entries, entryBoundaries, scheduled, (id) => SKILLS.has(id));
  return buildMergedRows(entries, markers, queue);
}

const seg = (startIndex: number, remap = true): RemapSegment => ({
  startIndex,
  endIndex: startIndex,
  attributes: A,
  seconds: 0,
  remap,
});

describe('removeEntry', () => {
  it('removes only that row, writing entries alone for a plan with no Remap Markers', () => {
    expect(removeEntry(plan(), 2, 1)).toEqual({ entries: [entry(1), entry(3)] });
  });

  it('shifts a Remap Marker after the removed entry left, together with its attributes', () => {
    // Markers before entries[1] and after the last entry; removing entry 0
    // moves both one position left and each keeps its own override.
    expect(removeEntry(plan({ markers: [1, 3], markerAttributes: [A, B] }), 1, 1)).toEqual({
      entries: [entry(2), entry(3)],
      markers: [0, 2],
      markerAttributes: [A, B],
    });
  });

  it('keeps a marker at or before the removed entry in place', () => {
    expect(removeEntry(plan({ markers: [1] }), 2, 1)).toEqual({
      entries: [entry(1), entry(3)],
      markers: [1],
      markerAttributes: [null],
    });
  });

  it("keeps the first marker's attributes when the removal collapses two markers into one", () => {
    const five = { entries: [1, 2, 3, 4, 5].map((id) => entry(id)) };
    // Markers [3, 4] both land on 3 once entries[3] goes.
    expect(removeEntry({ ...five, markers: [3, 4], markerAttributes: [A, B] }, 4, 1)).toEqual({
      entries: [entry(1), entry(2), entry(3), entry(5)],
      markers: [3],
      markerAttributes: [A],
    });
  });

  it('only normalizes the markers when the entry is not in the plan', () => {
    expect(removeEntry(plan({ markers: [1, 9], markerAttributes: [A, B] }), 99, 1)).toEqual({
      entries: [entry(1), entry(2), entry(3)],
      markers: [1, 3],
      markerAttributes: [A, B],
    });
  });
});

describe('addEntry / setPriority / appendImport / applyReorder — entries-only edits', () => {
  it('adds an entry at the end, and not again when the plan already covers it', () => {
    expect(addEntry(plan(), entry(4))).toEqual({
      entries: [entry(1), entry(2), entry(3), entry(4)],
    });
    expect(addEntry(plan(), entry(2))).toEqual({ entries: [entry(1), entry(2), entry(3)] });
  });

  it("sets a skill's priority on its row", () => {
    expect(setPriority(plan(), 2, 'high')).toEqual({
      entries: [entry(1), { skillTypeID: 2, targetLevel: 1, priority: 'high' }, entry(3)],
    });
  });

  it('appends only the imported levels the plan does not already cover', () => {
    expect(appendImport(plan({ markers: [1] }), [entry(2), entry(4, 2)])).toEqual({
      entries: [entry(1), entry(2), entry(3), entry(4, 2)],
    });
  });

  it('reorders entries to a suggested step order', () => {
    const steps = [
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 2, level: 1 },
    ];
    expect(applyReorder(plan(), steps)).toEqual({ entries: [entry(3), entry(1), entry(2)] });
  });
});

describe('addRemapMarker', () => {
  it('appends a marker after the last entry with no attribute override', () => {
    expect(addRemapMarker(plan())).toEqual({ markers: [3], markerAttributes: [null] });
    expect(addRemapMarker(plan({ markers: [1], markerAttributes: [A] }))).toEqual({
      markers: [1, 3],
      markerAttributes: [A, null],
    });
  });

  it('keeps the existing override when a marker already sits after the last entry', () => {
    expect(addRemapMarker(plan({ markers: [3], markerAttributes: [A] }))).toEqual({
      markers: [3],
      markerAttributes: [A],
    });
  });
});

describe('removeRemapMarker', () => {
  it('removes the marker and its attributes together, by ordinal in normalized order', () => {
    // [3, 1] normalizes to [1, 3], so ordinal 0 is the marker at 1 (attributes B).
    const marked = plan({ markers: [3, 1], markerAttributes: [A, B] });
    expect(removeRemapMarker(marked, 0)).toEqual({ markers: [3], markerAttributes: [A] });
    expect(removeRemapMarker(marked, 1)).toEqual({ markers: [1], markerAttributes: [B] });
  });
});

describe('setRemapMarkerAttributes / alignedMarkerAttributes', () => {
  it("reads each marker's override aligned to normalized marker order, null for none", () => {
    expect(alignedMarkerAttributes(plan({ markers: [3, 1], markerAttributes: [A] }))).toEqual([
      null,
      A,
    ]);
    expect(alignedMarkerAttributes(plan())).toEqual([]);
  });

  it("sets one marker's override, writing a dense list aligned to the markers", () => {
    const marked = plan({ markers: [3, 1], markerAttributes: [A] });
    expect(setRemapMarkerAttributes(marked, 0, B)).toEqual({ markerAttributes: [B, A] });
  });

  it("clears one marker's override with null", () => {
    const marked = plan({ markers: [1], markerAttributes: [A] });
    expect(setRemapMarkerAttributes(marked, 0, null)).toEqual({ markerAttributes: [null] });
  });
});

describe('moveRow', () => {
  const move = (p: SkillPlanEditable, activeId: string, overId: string) =>
    moveRow(p, {
      rows: mergedRows(p.entries, p.markers),
      activeId,
      overId,
      skills: SKILLS,
      trainedSkills: NO_TRAINED,
    });

  it('reorders two unrelated entries, markers staying at their positions', () => {
    const p: SkillPlanEditable = { entries: [entry(3), entry(4)], markers: [2] };
    expect(move(p, entryId(entry(4)), entryId(entry(3)))).toEqual({
      ok: true,
      patch: { entries: [entry(4), entry(3)], markers: [2], markerAttributes: [null] },
      promoted: null,
    });
  });

  it("carries each marker's attributes along when a drag reorders two markers", () => {
    // Rows: [entry 1-III, marker 0, entry 3, marker 1]. Dragging marker 1 to
    // the top puts it ahead of marker 0, so their overrides trade places.
    const p: SkillPlanEditable = {
      entries: [entry(1, 3), entry(3)],
      markers: [1, 2],
      markerAttributes: [A, B],
    };
    expect(move(p, markerRowId(1), entryId(entry(1, 3)))).toEqual({
      ok: true,
      patch: { entries: [entry(1, 3), entry(3)], markers: [0, 1], markerAttributes: [B, A] },
      promoted: null,
    });
  });

  it('refuses a drop the normalizer would undo, naming the entry in the way', () => {
    const p: SkillPlanEditable = { entries: [entry(1, 3), entry(2, 5)] };
    const result = move(p, entryId(entry(1, 3)), entryId(entry(2, 5)));
    expect(result).toMatchObject({ ok: false, skillTypeID: 1, blockedBy: 2 });
    expect(result).not.toHaveProperty('patch');
  });

  it('promotes a dragged prereq row into a real entry, saying which', () => {
    const p: SkillPlanEditable = { entries: [entry(3), entry(2, 5)] };
    const result = move(p, prereqRowId(1, 3), entryId(entry(3)));
    expect(result).toMatchObject({ ok: true, promoted: { skillTypeID: 1, level: 3 } });
    if (!result.ok) return;
    expect(result.patch.entries).toEqual([entry(1, 3), entry(3), entry(2, 5)]);
  });
});

describe('promotePrereqRow', () => {
  it('inserts the entry where the prereq row sat, markers and attributes kept together', () => {
    const p: SkillPlanEditable = {
      entries: [entry(3), entry(2, 5)],
      markers: [0],
      markerAttributes: [A],
    };
    expect(promotePrereqRow(p, mergedRows(p.entries, p.markers), prereqRowId(1, 3))).toEqual({
      entries: [entry(3), entry(1, 3), entry(2, 5)],
      markers: [0],
      markerAttributes: [A],
    });
  });

  it('writes empty marker lists for a plan with no markers', () => {
    const p: SkillPlanEditable = { entries: [entry(3), entry(2, 5)] };
    expect(promotePrereqRow(p, mergedRows(p.entries), prereqRowId(1, 3))).toEqual({
      entries: [entry(3), entry(1, 3), entry(2, 5)],
      markers: [],
      markerAttributes: [],
    });
  });

  it('returns null for a row that is not a prereq row of this plan', () => {
    const p: SkillPlanEditable = { entries: [entry(3)] };
    expect(promotePrereqRow(p, mergedRows(p.entries), entryId(entry(3)))).toBeNull();
  });
});

describe('replaceWithImport', () => {
  it('swaps the entries and resets Remap Markers and their attributes together', () => {
    const marked = plan({ markers: [1, 3], markerAttributes: [A, B] });
    expect(replaceWithImport(marked, [entry(4, 3)]).patch).toEqual({
      entries: [entry(4, 3)],
      markers: [],
      markerAttributes: [],
    });
  });

  it('undo restores the prior plan exactly', () => {
    const before = plan({ markers: [1, 3], markerAttributes: [A, null] });
    const { patch, undo } = replaceWithImport(before, [entry(4, 3)]);
    expect({ ...before, ...patch, ...undo }).toEqual(before);
  });

  it('snapshots absent marker lists as empty ones, never as undefined', () => {
    // A synced write can't carry an explicit `undefined` (Firestore rejects
    // it), and an absent list already reads as empty everywhere.
    expect(replaceWithImport(plan(), [entry(4)]).undo).toEqual({
      entries: [entry(1), entry(2), entry(3)],
      markers: [],
      markerAttributes: [],
    });
  });
});

describe('applyRemapSegments / applyOptimizeForMe', () => {
  it("replaces the markers with one per remapped segment, dropping the old markers' overrides", () => {
    // Steps [1, 3, 4], one per entry: each segment start is an entry boundary.
    const p: SkillPlanEditable = {
      entries: [entry(1), entry(3), entry(4)],
      markers: [3],
      markerAttributes: [A],
    };
    expect(applyRemapSegments(p, [seg(0, false), seg(1), seg(2)], SKILLS, NO_TRAINED)).toEqual({
      markers: [1, 2],
      markerAttributes: [],
    });
  });

  it('reorders the entries and places markers against the new order, in one patch', () => {
    const p: SkillPlanEditable = { entries: [entry(1), entry(3), entry(4)], markers: [1] };
    const order = [
      { skillTypeID: 4, level: 1 },
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 1, level: 1 },
    ];
    // Segment 2 starts at step 2 of the *new* order — entry 1, now last.
    expect(applyOptimizeForMe(p, order, [seg(0, false), seg(2)], SKILLS, NO_TRAINED)).toEqual({
      entries: [entry(4), entry(3), entry(1)],
      markers: [2],
      markerAttributes: [],
    });
  });
});

describe('splitByLevel', () => {
  it('splits a multi-level entry into one row per level, carrying its marker along', () => {
    const p: SkillPlanEditable = { entries: [entry(3, 3), entry(4)], markers: [1] };
    expect(splitByLevel(p, SKILLS, NO_TRAINED)).toEqual({
      entries: [entry(3, 1), entry(3, 2), entry(3, 3), entry(4)],
      markers: [3],
    });
  });

  it('writes entries alone for a plan with no markers', () => {
    expect(splitByLevel({ entries: [entry(3, 2)] }, SKILLS, NO_TRAINED)).toEqual({
      entries: [entry(3, 1), entry(3, 2)],
    });
  });

  it('returns null when every entry is already one level', () => {
    expect(splitByLevel(plan({ markers: [1] }), SKILLS, NO_TRAINED)).toBeNull();
  });
});
