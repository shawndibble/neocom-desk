import { describe, it, expect } from 'vitest';
import { normalizePlanWithBoundaries } from '@/engine/plan';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import { markerRowId } from './markers';
import { entryId } from './reorder';
import { buildMergedRows, summarizeEntryQueue, type MergedRow } from './queueRows';
import { parsePrereqRowId, planDrop, prereqRowId, promotePrereq } from './planDrop';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

const skill = (typeID: number, prereqs: EngineSkill['prereqs'] = []): EngineSkill => ({
  typeID,
  name: `Skill ${typeID}`,
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs,
});

/** 1 is free-standing; 2 needs 1 at III; 3 is unrelated. */
const SKILLS = new Map<number, EngineSkill>(
  [skill(1), skill(2, [{ typeID: 1, level: 3 }]), skill(3)].map((s) => [s.typeID, s])
);

const NO_TRAINED = new Map<number, TrainedSkill>();

/** The same merged-row list PlanEditor feeds EntryList, with stand-in times. */
function mergedRows(
  entries: readonly PlanEntry[],
  markers?: readonly number[],
  trainedSkills: ReadonlyMap<number, TrainedSkill> = NO_TRAINED
): MergedRow[] {
  const valid = entries.filter((e) => SKILLS.has(e.skillTypeID));
  const { steps, entryBoundaries } = normalizePlanWithBoundaries(valid, SKILLS, trainedSkills);
  const scheduled: ScheduledStep[] = steps.map((step, i) => ({
    ...step,
    sp: 250,
    seconds: 60,
    cumulativeSeconds: 60 * (i + 1),
  }));
  const queue = summarizeEntryQueue(entries, entryBoundaries, scheduled, (id) => SKILLS.has(id));
  return buildMergedRows(entries, markers, queue);
}

function drop(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  activeId: string,
  overId: string,
  trainedSkills: ReadonlyMap<number, TrainedSkill> = NO_TRAINED
) {
  return planDrop({
    entries,
    markers,
    rows: mergedRows(entries, markers, trainedSkills),
    activeId,
    overId,
    skills: SKILLS,
    trainedSkills,
  });
}

describe('prereq row ids', () => {
  it('round-trips the id format buildMergedRows actually emits', () => {
    const rows = mergedRows([entry(2, 5)]);
    const first = rows[0];
    expect(first.kind).toBe('prereq');
    expect(first.id).toBe(prereqRowId(1, 1));
    expect(parsePrereqRowId(first.id)).toEqual({ skillTypeID: 1, level: 1 });
  });

  it('returns null for entry and marker row ids', () => {
    expect(parsePrereqRowId(entryId(entry(2)))).toBeNull();
    expect(parsePrereqRowId(markerRowId(0))).toBeNull();
  });
});

describe('planDrop — promoting a prereq row', () => {
  it('turns the dragged prereq level into a real entry at the drop position', () => {
    // rows: entry 3, prereq 1-I, 1-II, 1-III, entry 2
    const entries = [entry(3), entry(2, 5)];
    const result = drop(entries, undefined, prereqRowId(1, 3), entryId(entry(3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(1, 3), entry(3), entry(2, 5)]);
    expect(result.promoted).toEqual({ skillTypeID: 1, level: 3 });
  });

  it('promotes in place when dropped inside its own block, rather than reporting a conflict', () => {
    const entries = [entry(3), entry(2, 5)];
    // Onto the entry the prereq was pulled in for...
    const ontoOwner = drop(entries, undefined, prereqRowId(1, 1), entryId(entry(2, 5)));
    expect(ontoOwner.ok).toBe(true);
    if (!ontoOwner.ok) return;
    expect(ontoOwner.entries).toEqual([entry(3), entry(1, 1), entry(2, 5)]);

    // ...and onto a sibling prereq row of the same block.
    const ontoSibling = drop(entries, undefined, prereqRowId(1, 1), prereqRowId(1, 3));
    expect(ontoSibling.ok).toBe(true);
    if (!ontoSibling.ok) return;
    expect(ontoSibling.entries).toEqual([entry(3), entry(1, 1), entry(2, 5)]);
  });

  it("adds the promoted level as its own row, leaving the skill's other levels put", () => {
    // 2 pulls 1 up to III itself, so entry 1 only owns levels IV-V and its
    // first three levels still render as prereq rows of entry 2. Promoting
    // one of those levels is additive now that a plan holds one row per
    // level: the existing 1-V row is not moved or raised to cover it.
    const entries = [entry(2, 5), entry(1, 5)];
    const result = drop(entries, undefined, prereqRowId(1, 2), entryId(entry(2, 5)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(1, 2), entry(2, 5), entry(1, 5)]);
  });

  it('keeps marker positions anchored to the entries they sit between', () => {
    const entries = [entry(3), entry(2, 5)];
    const result = drop(entries, [1], prereqRowId(1, 3), entryId(entry(3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(1, 3), entry(3), entry(2, 5)]);
    // The marker sat before entry 2; it still does.
    expect(result.markers).toEqual([2]);
  });
});

describe('planDrop — a drop the normalizer would silently undo', () => {
  it('rejects dragging a prereq past the entry that requires it, naming the blocker', () => {
    // rows: prereq 1-I, 1-II, 1-III, entry 2, entry 3
    const entries = [entry(2, 5), entry(3)];
    const result = drop(entries, undefined, prereqRowId(1, 1), entryId(entry(3)));
    expect(result).toEqual({ ok: false, skillTypeID: 1, blockedBy: 2 });
  });

  it('rejects dragging an existing entry below its own dependent', () => {
    const entries = [entry(1, 3), entry(2, 5)];
    const result = drop(entries, undefined, entryId(entry(1, 3)), entryId(entry(2, 5)));
    expect(result).toEqual({ ok: false, skillTypeID: 1, blockedBy: 2 });
  });

  it('allows a partial-cover move that still leaves the entry levels of its own', () => {
    // 2 only needs 1 at III, so entry 1 at V keeps IV-V after the move.
    const entries = [entry(1, 5), entry(2, 5)];
    const result = drop(entries, undefined, entryId(entry(1, 5)), entryId(entry(2, 5)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(2, 5), entry(1, 5)]);
  });

  it("refuses a drop that strands another level of the dragged row's own skill", () => {
    // One row per skill level, so dragging 1-III above 1-II leaves III with
    // both levels to train and II with none: the dragged row looks fine and
    // its sibling is the ghost. Checking only the dragged row would have
    // allowed this and left a zero-time row behind.
    const entries = [entry(1, 2), entry(1, 3)];
    const result = drop(entries, undefined, entryId(entry(1, 3)), entryId(entry(1, 2)));
    expect(result).toEqual({ ok: false, skillTypeID: 1, blockedBy: 1 });
  });

  it('leaves an already-trained entry alone rather than calling it blocked', () => {
    const trained = new Map<number, TrainedSkill>([[3, { level: 1, sp: 250 }]]);
    const entries = [entry(3), entry(2, 5)];
    const result = drop(entries, undefined, entryId(entry(3)), entryId(entry(2, 5)), trained);
    expect(result.ok).toBe(true);
  });
});

describe('planDrop — ordinary entry and marker drags', () => {
  it('reorders two unrelated entries', () => {
    const entries = [entry(3), entry(1, 3)];
    const result = drop(entries, undefined, entryId(entry(1, 3)), entryId(entry(3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(1, 3), entry(3)]);
    expect(result.promoted).toBeNull();
  });

  it('drops onto a prereq row by landing ahead of the block it belongs to', () => {
    // rows: prereq 1-I, 1-II, 1-III, entry 2, entry 3 — dropping entry 3 on a
    // prereq row used to be a silent no-op, because prereq ids are not entry ids.
    const entries = [entry(2, 5), entry(3)];
    const result = drop(entries, undefined, entryId(entry(3)), prereqRowId(1, 2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([entry(3), entry(2, 5)]);
  });

  it('never blocks a marker drag', () => {
    const entries = [entry(1, 3), entry(2, 5)];
    const result = drop(entries, [2], markerRowId(0), entryId(entry(1, 3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markers).toEqual([0]);
    expect(result.entries).toEqual([entry(1, 3), entry(2, 5)]);
  });

  it('returns the plan unchanged for an unknown row id', () => {
    const entries = [entry(1, 3), entry(2, 5)];
    const result = drop(entries, undefined, entryId(entry(1, 3)), 'nope');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual(entries);
  });
});

describe('promotePrereq — the non-drag affordance', () => {
  it('inserts the entry exactly where the dimmed row already sat', () => {
    const entries = [entry(3), entry(2, 5)];
    const rows = mergedRows(entries);
    const result = promotePrereq({ entries, markers: undefined, rows, rowId: prereqRowId(1, 3) });
    expect(result).not.toBeNull();
    expect(result?.entries).toEqual([entry(3), entry(1, 3), entry(2, 5)]);
  });

  it('returns null when the row id is not a prereq row of this plan', () => {
    const entries = [entry(3)];
    const rows = mergedRows(entries);
    expect(
      promotePrereq({ entries, markers: undefined, rows, rowId: entryId(entry(3)) })
    ).toBeNull();
    expect(
      promotePrereq({ entries, markers: undefined, rows, rowId: prereqRowId(9, 1) })
    ).toBeNull();
  });
});
