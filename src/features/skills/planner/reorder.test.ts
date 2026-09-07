import { describe, it, expect } from 'vitest';
import type { PlanEntry } from '@/engine/types';
import {
  dedupeEntries,
  upsertEntry,
  removeEntry,
  applyReorderSuggestion,
  entryId,
  setEntryPriority,
} from './reorder';

describe('entryId', () => {
  it('is the skill and its level, so one skill can hold several rows', () => {
    expect(entryId({ skillTypeID: 3300, targetLevel: 5 })).toBe('3300-5');
    expect(entryId({ skillTypeID: 3300, targetLevel: 4 })).not.toBe(
      entryId({ skillTypeID: 3300, targetLevel: 5 })
    );
  });
});

describe('dedupeEntries', () => {
  it("keeps a skill's distinct levels as separate rows", () => {
    const entries: PlanEntry[] = [
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3300, targetLevel: 5 },
    ];
    // The whole point of the per-level rule: the user can drag another skill
    // between Mass Production IV and V, so collapsing them would take that away.
    expect(dedupeEntries(entries)).toEqual(entries);
  });

  it('drops a row repeating a (skill, level) already present, keeping the first', () => {
    expect(
      dedupeEntries([
        { skillTypeID: 2, targetLevel: 3 },
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 2, targetLevel: 3 },
      ])
    ).toEqual([
      { skillTypeID: 2, targetLevel: 3 },
      { skillTypeID: 1, targetLevel: 1 },
    ]);
  });

  it('returns [] for an empty list', () => {
    expect(dedupeEntries([])).toEqual([]);
  });

  it('preserves fields beyond skillTypeID and targetLevel, from the row it keeps', () => {
    const entries: PlanEntry[] = [
      { skillTypeID: 1, targetLevel: 3, priority: 'high' },
      { skillTypeID: 1, targetLevel: 3, priority: 'low' },
    ];
    expect(dedupeEntries(entries)).toEqual([{ skillTypeID: 1, targetLevel: 3, priority: 'high' }]);
  });
});

describe('upsertEntry', () => {
  it('appends a new skill', () => {
    expect(
      upsertEntry([{ skillTypeID: 1, targetLevel: 3 }], { skillTypeID: 2, targetLevel: 1 })
    ).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 2, targetLevel: 1 },
    ]);
  });

  it('adds a higher level of a skill already in the plan as its own row', () => {
    const result = upsertEntry(
      [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 2, targetLevel: 1 },
      ],
      { skillTypeID: 1, targetLevel: 5 }
    );
    // Level 5 is a row of its own; splitEntriesByLevel is what turns it into
    // the individual levels 4 and 5 once the character's trained level is known.
    expect(result).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 2, targetLevel: 1 },
      { skillTypeID: 1, targetLevel: 5 },
    ]);
  });

  it('adds nothing when an existing row already trains the skill that high', () => {
    // A row for a level an earlier row already covers would train nothing and
    // render as a zero-time ghost.
    const result = upsertEntry([{ skillTypeID: 1, targetLevel: 5 }], {
      skillTypeID: 1,
      targetLevel: 2,
    });
    expect(result).toEqual([{ skillTypeID: 1, targetLevel: 5 }]);
  });
});

describe('setEntryPriority', () => {
  it('sets the priority of the matching entry, leaving others untouched', () => {
    const entries: PlanEntry[] = [
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 2, targetLevel: 1, priority: 'low' },
    ];
    expect(setEntryPriority(entries, 1, 'high')).toEqual([
      { skillTypeID: 1, targetLevel: 3, priority: 'high' },
      { skillTypeID: 2, targetLevel: 1, priority: 'low' },
    ]);
  });

  it('overwrites an existing priority', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 1, targetLevel: 3, priority: 'high' }];
    expect(setEntryPriority(entries, 1, 'low')).toEqual([
      { skillTypeID: 1, targetLevel: 3, priority: 'low' },
    ]);
  });

  it('is a no-op when the skill is not in the plan', () => {
    const entries: PlanEntry[] = [{ skillTypeID: 1, targetLevel: 3 }];
    expect(setEntryPriority(entries, 99, 'high')).toEqual(entries);
  });
});

describe('removeEntry', () => {
  it('removes the matching row only', () => {
    const result = removeEntry(
      [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 2, targetLevel: 1 },
      ],
      1,
      3
    );
    expect(result).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
  });

  it("leaves the skill's other levels where the user put them", () => {
    const result = removeEntry(
      [
        { skillTypeID: 1, targetLevel: 4 },
        { skillTypeID: 2, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 5 },
      ],
      1,
      5
    );
    expect(result).toEqual([
      { skillTypeID: 1, targetLevel: 4 },
      { skillTypeID: 2, targetLevel: 1 },
    ]);
  });
});

describe('applyReorderSuggestion', () => {
  it("orders a skill's own levels by where the suggestion trains each one", () => {
    const entries = [
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 1 },
      { skillTypeID: 1, targetLevel: 4 },
    ];
    const suggestedSteps = [
      { skillTypeID: 1, level: 4 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 1, level: 5 },
    ];
    expect(applyReorderSuggestion(entries, suggestedSteps)).toEqual([
      { skillTypeID: 1, targetLevel: 4 },
      { skillTypeID: 2, targetLevel: 1 },
      { skillTypeID: 1, targetLevel: 5 },
    ]);
  });

  it("falls back to a skill's first step when the suggestion has no step for that exact level", () => {
    const entries = [
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 4 },
    ];
    const suggestedSteps = [
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 3, level: 2 },
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 2, level: 1 },
    ];
    expect(applyReorderSuggestion(entries, suggestedSteps)).toEqual([
      { skillTypeID: 3, targetLevel: 4 },
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 3 },
    ]);
  });

  it('ignores prereq-only steps for skills that are not user entries', () => {
    const entries = [{ skillTypeID: 1, targetLevel: 5 }];
    const suggestedSteps = [
      { skillTypeID: 99, level: 1 }, // prereq, not a user entry
      { skillTypeID: 1, level: 1 },
    ];
    expect(applyReorderSuggestion(entries, suggestedSteps)).toEqual([
      { skillTypeID: 1, targetLevel: 5 },
    ]);
  });

  it('leaves entries with no matching step at the end, in original order', () => {
    const entries = [
      { skillTypeID: 1, targetLevel: 1 },
      { skillTypeID: 2, targetLevel: 1 },
    ];
    expect(applyReorderSuggestion(entries, [])).toEqual(entries);
  });
});
