/**
 * The vetting settings form as plain data: saved settings in, the strings and ticks the inputs
 * edit, the problems that block Save, and the patch `saveVettingSettingsCallable` takes. Pure.
 *
 * On or off, the watchlist and invite links are not here: each of those saves by itself.
 */
import {
  VETTING_MINIMUM_LIMITS,
  VETTING_QUESTIONS_MAX,
  type VettingKind,
  type VettingMinimumId,
  type VettingRejection,
  type VettingSettings,
} from '@/engine/vetting';
import { maskNumber, unmaskCount } from '@/lib/numberMask';
import type { VettingSettingsPatch } from './vettingBackend';

export interface VettingQuestionDraft {
  /** Stable while the form is open, so a row keeps its input when the list is reordered. */
  key: string;
  /** Absent on a question added in this form: the server gives it one. */
  id?: string;
  label: string;
  required: boolean;
}

export interface VettingSettingsForm {
  welcome: string;
  contact: string;
  /** As typed; blank reads as no minimum. */
  minimums: Record<VettingMinimumId, string>;
  questions: VettingQuestionDraft[];
  inviteOnly: boolean;
  signOffs: Record<VettingKind, number>;
  wording: VettingRejection['wording'];
  showReason: boolean;
  mailDecision: boolean;
  notifyReviewers: boolean;
}

/** The sections of the settings page, in order. */
export const VETTING_SETTINGS_SECTIONS = [
  'general',
  'applicants',
  'decisions',
  'watchlist',
] as const;
export type VettingSettingsSection = (typeof VETTING_SETTINGS_SECTIONS)[number];

export const VETTING_MINIMUM_IDS: readonly VettingMinimumId[] = [
  'ageDays',
  'skillPoints',
  'characters',
];

/** The least each minimum can be, which is also "none asked". */
export const VETTING_MINIMUM_FLOOR: Record<VettingMinimumId, number> = {
  ageDays: 0,
  skillPoints: 0,
  characters: 1,
};

export function formFromSettings(settings: VettingSettings): VettingSettingsForm {
  return {
    welcome: settings.welcome,
    contact: settings.contact,
    minimums: {
      ageDays: maskNumber(settings.minimums.ageDays),
      skillPoints: maskNumber(settings.minimums.skillPoints),
      characters: maskNumber(settings.minimums.characters),
    },
    questions: settings.questions.map((question) => ({ key: question.id, ...question })),
    inviteOnly: settings.inviteOnly,
    signOffs: { ...settings.signOffs },
    wording: settings.rejection.wording,
    showReason: settings.rejection.showReason,
    mailDecision: settings.mailDecision,
    notifyReviewers: settings.notifyReviewers,
  };
}

/**
 * A typed minimum as the number that would be saved: blank is the floor, anything past the
 * engine's limit is the limit. Null when it is not a number at all.
 */
export function parseMinimum(id: VettingMinimumId, raw: string): number | null {
  if (raw.trim() === '') return VETTING_MINIMUM_FLOOR[id];
  const value = unmaskCount(raw);
  if (value === undefined) return null;
  return Math.min(VETTING_MINIMUM_LIMITS[id], Math.max(VETTING_MINIMUM_FLOOR[id], value));
}

/** A typed minimum as the field shows it once left: clamped and grouped. Unreadable text is kept. */
export function settleMinimum(id: VettingMinimumId, raw: string): string {
  const value = parseMinimum(id, raw);
  return value === null ? raw : maskNumber(value);
}

export function addQuestion(form: VettingSettingsForm, key: string): VettingSettingsForm {
  if (form.questions.length >= VETTING_QUESTIONS_MAX) return form;
  return { ...form, questions: [...form.questions, { key, label: '', required: false }] };
}

export function removeQuestion(form: VettingSettingsForm, key: string): VettingSettingsForm {
  return { ...form, questions: form.questions.filter((question) => question.key !== key) };
}

/** Moves a question one place up (`-1`) or down (`1`); the ends stay put. */
export function moveQuestion(
  form: VettingSettingsForm,
  key: string,
  by: -1 | 1
): VettingSettingsForm {
  const from = form.questions.findIndex((question) => question.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= form.questions.length) return form;
  const questions = [...form.questions];
  [questions[from], questions[to]] = [questions[to], questions[from]];
  return { ...form, questions };
}

export function patchQuestion(
  form: VettingSettingsForm,
  key: string,
  change: Partial<Pick<VettingQuestionDraft, 'label' | 'required'>>
): VettingSettingsForm {
  return {
    ...form,
    questions: form.questions.map((question) =>
      question.key === key ? { ...question, ...change } : question
    ),
  };
}

export interface VettingFormProblems {
  minimums: VettingMinimumId[];
  /** Keys of questions with no wording. */
  questions: string[];
  count: number;
}

export function formProblems(form: VettingSettingsForm): VettingFormProblems {
  const minimums = VETTING_MINIMUM_IDS.filter((id) => parseMinimum(id, form.minimums[id]) === null);
  const questions = form.questions
    .filter((question) => question.label.trim() === '')
    .map((question) => question.key);
  return { minimums, questions, count: minimums.length + questions.length };
}

type QuestionPatch = NonNullable<VettingSettingsPatch['questions']>;

const questionsOf = (form: VettingSettingsForm): QuestionPatch =>
  form.questions.map((question) => ({
    ...(question.id === undefined ? {} : { id: question.id }),
    label: question.label.trim(),
    required: question.required,
  }));

/** Only what changed. Questions, minimums, the rejection and sign-offs each go whole. */
export function formToPatch(
  form: VettingSettingsForm,
  saved: VettingSettings
): VettingSettingsPatch {
  const patch: VettingSettingsPatch = {};
  if (form.welcome.trim() !== saved.welcome) patch.welcome = form.welcome.trim();
  if (form.contact.trim() !== saved.contact) patch.contact = form.contact.trim();

  const minimums = { ...saved.minimums };
  for (const id of VETTING_MINIMUM_IDS) {
    minimums[id] = parseMinimum(id, form.minimums[id]) ?? saved.minimums[id];
  }
  if (VETTING_MINIMUM_IDS.some((id) => minimums[id] !== saved.minimums[id])) {
    patch.minimums = minimums;
  }

  const questions = questionsOf(form);
  if (JSON.stringify(questions) !== JSON.stringify(questionsOf(formFromSettings(saved)))) {
    patch.questions = questions;
  }

  if (form.inviteOnly !== saved.inviteOnly) patch.inviteOnly = form.inviteOnly;
  if (
    form.signOffs.application !== saved.signOffs.application ||
    form.signOffs.promotion !== saved.signOffs.promotion
  ) {
    patch.signOffs = { ...form.signOffs };
  }
  if (form.wording !== saved.rejection.wording || form.showReason !== saved.rejection.showReason) {
    patch.rejection = { wording: form.wording, showReason: form.showReason };
  }
  if (form.mailDecision !== saved.mailDecision) patch.mailDecision = form.mailDecision;
  if (form.notifyReviewers !== saved.notifyReviewers) {
    patch.notifyReviewers = form.notifyReviewers;
  }
  return patch;
}

export function formIsDirty(form: VettingSettingsForm, saved: VettingSettings): boolean {
  return Object.keys(formToPatch(form, saved)).length > 0;
}

/** Which sections hold an unsaved edit, so the section list can mark them. */
export function dirtySections(
  form: VettingSettingsForm,
  saved: VettingSettings
): VettingSettingsSection[] {
  const patch = formToPatch(form, saved);
  const has = (...keys: (keyof VettingSettingsPatch)[]) => keys.some((key) => key in patch);
  return [
    ...(has('welcome', 'contact') ? (['general'] as const) : []),
    ...(has('minimums', 'questions', 'inviteOnly') ? (['applicants'] as const) : []),
    ...(has('signOffs', 'rejection', 'mailDecision', 'notifyReviewers')
      ? (['decisions'] as const)
      : []),
  ];
}
