import { describe, it, expect } from 'vitest';
import {
  dedupeEntries,
  upsertEntry,
  removeEntry,
  applyReorderSuggestion,
  entryId,
} from './reorder';

describe('entryId', () => {
  it('is the skillTypeID as a string', () => {
    expect(entryId({ skillTypeID: 3300, targetLevel: 5 })).toBe('3300');
  });
});

describe('dedupeEntries', () => {
  it('collapses multiple rows for one skill to its highest target level', () => {
    expect(
      dedupeEntries([
        { skillTypeID: 3300, targetLevel: 4 },
        { skillTypeID: 3300, targetLevel: 5 },
      ])
    ).toEqual([{ skillTypeID: 3300, targetLevel: 5 }]);
  });

  it('keeps first-appearance order across distinct skills', () => {
    expect(
      dedupeEntries([
        { skillTypeID: 2, targetLevel: 3 },
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 2, targetLevel: 5 },
      ])
    ).toEqual([
      { skillTypeID: 2, targetLevel: 5 },
      { skillTypeID: 1, targetLevel: 1 },
    ]);
  });

  it('returns [] for an empty list', () => {
    expect(dedupeEntries([])).toEqual([]);
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

  it('raises the target level of an existing entry in place, never duplicating', () => {
    const result = upsertEntry(
      [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 2, targetLevel: 1 },
      ],
      { skillTypeID: 1, targetLevel: 5 }
    );
    expect(result).toEqual([
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 1 },
    ]);
  });

  it('never lowers an existing target level', () => {
    const result = upsertEntry([{ skillTypeID: 1, targetLevel: 5 }], {
      skillTypeID: 1,
      targetLevel: 2,
    });
    expect(result).toEqual([{ skillTypeID: 1, targetLevel: 5 }]);
  });
});

describe('removeEntry', () => {
  it('removes the matching skill only', () => {
    const result = removeEntry(
      [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 2, targetLevel: 1 },
      ],
      1
    );
    expect(result).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
  });
});

describe('applyReorderSuggestion', () => {
  it('sorts entries by first occurrence in the suggested steps, preserving target levels', () => {
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
