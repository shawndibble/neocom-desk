import { describe, expect, it } from 'vitest';
import {
  VETTING_DEFAULT_SETTINGS,
  VETTING_MINIMUM_LIMITS,
  VETTING_QUESTIONS_MAX,
  type VettingSettings,
} from '@/engine/vetting';
import {
  addQuestion,
  dirtySections,
  formFromSettings,
  formIsDirty,
  formProblems,
  formToPatch,
  moveQuestion,
  parseMinimum,
  patchQuestion,
  removeQuestion,
  settleMinimum,
} from './vettingSettingsForm';

const saved: VettingSettings = {
  ...VETTING_DEFAULT_SETTINGS,
  on: true,
  questions: [
    { id: 'q1', label: 'Timezone?', required: true },
    { id: 'q2', label: 'Who referred you?', required: false },
  ],
};

describe('formToPatch', () => {
  it('sends nothing for an untouched form, defaults included', () => {
    expect(
      formToPatch(formFromSettings(VETTING_DEFAULT_SETTINGS), VETTING_DEFAULT_SETTINGS)
    ).toEqual({});
    expect(formIsDirty(formFromSettings(saved), saved)).toBe(false);
  });

  it('sends only the text that changed, trimmed', () => {
    const form = { ...formFromSettings(saved), welcome: '  Fly safe.  ', contact: 'Ilse Marrow' };
    expect(formToPatch(form, saved)).toEqual({ welcome: 'Fly safe.', contact: 'Ilse Marrow' });
    expect(formToPatch({ ...formFromSettings(saved), welcome: '   ' }, saved)).toEqual({});
  });

  it('sends the minimums whole when one changes, clamped to the engine limits', () => {
    const form = formFromSettings(saved);
    form.minimums = { ageDays: '365', skillPoints: '999,999,999,999', characters: '' };
    expect(formToPatch(form, saved)).toEqual({
      minimums: { ageDays: 365, skillPoints: VETTING_MINIMUM_LIMITS.skillPoints, characters: 1 },
    });
  });

  it('keeps the saved minimum where the typed one is unreadable', () => {
    const form = formFromSettings(saved);
    form.minimums = { ...form.minimums, ageDays: 'old', characters: '2' };
    expect(formToPatch(form, saved)).toEqual({
      minimums: { ageDays: 0, skillPoints: 0, characters: 2 },
    });
  });

  it('sends the whole question list in order, a new one with no id', () => {
    let form = addQuestion(formFromSettings(saved), 'new-1');
    form = patchQuestion(form, 'new-1', { label: ' Main ship? ', required: true });
    form = moveQuestion(form, 'new-1', -1);
    expect(formToPatch(form, saved)).toEqual({
      questions: [
        { id: 'q1', label: 'Timezone?', required: true },
        { label: 'Main ship?', required: true },
        { id: 'q2', label: 'Who referred you?', required: false },
      ],
    });
  });

  it('sends the list when a question is removed or only its required tick changes', () => {
    expect(formToPatch(removeQuestion(formFromSettings(saved), 'q1'), saved)).toEqual({
      questions: [{ id: 'q2', label: 'Who referred you?', required: false }],
    });
    expect(
      formToPatch(patchQuestion(formFromSettings(saved), 'q2', { required: true }), saved).questions
    ).toEqual([
      { id: 'q1', label: 'Timezone?', required: true },
      { id: 'q2', label: 'Who referred you?', required: true },
    ]);
  });

  it('sends each decision setting by itself, the rejection and sign-offs whole', () => {
    const form = {
      ...formFromSettings(saved),
      wording: 'notNow' as const,
      mailDecision: false,
      signOffs: { application: 2, promotion: 2 },
      inviteOnly: true,
    };
    expect(formToPatch(form, saved)).toEqual({
      rejection: { wording: 'notNow', showReason: false },
      mailDecision: false,
      signOffs: { application: 2, promotion: 2 },
      inviteOnly: true,
    });
    expect(
      formToPatch({ ...formFromSettings(saved), notifyReviewers: false, showReason: true }, saved)
    ).toEqual({ rejection: { wording: 'rejected', showReason: true }, notifyReviewers: false });
  });
});

describe('questions', () => {
  it('stops adding at the most a corp may ask', () => {
    let form = formFromSettings(VETTING_DEFAULT_SETTINGS);
    for (let n = 0; n < VETTING_QUESTIONS_MAX + 2; n += 1) form = addQuestion(form, `k${n}`);
    expect(form.questions).toHaveLength(VETTING_QUESTIONS_MAX);
  });

  it('leaves the ends where they are', () => {
    const form = formFromSettings(saved);
    expect(moveQuestion(form, 'q1', -1)).toBe(form);
    expect(moveQuestion(form, 'q2', 1)).toBe(form);
    expect(moveQuestion(form, 'q2', -1).questions.map((q) => q.id)).toEqual(['q2', 'q1']);
  });
});

describe('formProblems', () => {
  it('counts a question with no wording and a minimum that is not a number', () => {
    let form = addQuestion(formFromSettings(saved), 'blank');
    form = { ...form, minimums: { ...form.minimums, skillPoints: 'lots' } };
    expect(formProblems(form)).toEqual({
      minimums: ['skillPoints'],
      questions: ['blank'],
      count: 2,
    });
    expect(formProblems(formFromSettings(saved)).count).toBe(0);
  });
});

describe('minimums', () => {
  it('reads blank as none asked and clamps to the limits', () => {
    expect(parseMinimum('ageDays', '')).toBe(0);
    expect(parseMinimum('characters', '')).toBe(1);
    expect(parseMinimum('characters', '0')).toBe(1);
    expect(parseMinimum('characters', '99')).toBe(VETTING_MINIMUM_LIMITS.characters);
    expect(parseMinimum('ageDays', '-4')).toBeNull();
    expect(parseMinimum('ageDays', 'abc')).toBeNull();
  });

  it('settles a typed figure to what would be saved, and keeps what it cannot read', () => {
    expect(settleMinimum('ageDays', '99999')).toBe('3,650');
    expect(settleMinimum('skillPoints', '50000000')).toBe('50,000,000');
    expect(settleMinimum('skillPoints', 'lots')).toBe('lots');
  });
});

describe('dirtySections', () => {
  it('names the sections holding an unsaved edit', () => {
    const form = { ...formFromSettings(saved), contact: 'x', showReason: true };
    expect(dirtySections(form, saved)).toEqual(['general', 'decisions']);
    expect(dirtySections(removeQuestion(formFromSettings(saved), 'q1'), saved)).toEqual([
      'applicants',
    ]);
  });
});
