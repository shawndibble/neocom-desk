// Vetting: callable input parsing. Pure; every refusal is `invalid-argument`.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { int } from './corpTaxBook.js';
import {
  VETTING_ANSWER_MAX,
  VETTING_CONTACT_MAX,
  VETTING_INVITE_LABEL_MAX,
  VETTING_NOTE_MAX,
  VETTING_QUESTIONS_MAX,
  VETTING_QUESTION_MAX,
  VETTING_ROLE_MAX,
  VETTING_WELCOME_MAX,
  type VettingKind,
  type VettingMinimums,
  type VettingRejection,
} from './vettingEngine.js';
import { VETTING_WATCH_ADD_MAX } from './vettingTypes.js';

const ID_MAX = 2_147_483_647;
const TOKEN_MAX = 8192;
const NAME_MAX = 100;
const QUESTION_ID_MAX = 64;

const corporationId = (d: Record<string, unknown>) =>
  int(d.corporationId, 'corporationId', 1, ID_MAX);
const accessToken = (d: Record<string, unknown>) =>
  boundedString(d.accessToken, 'accessToken', TOKEN_MAX);

/** Optional free text: absent is empty; longer than `max` is refused, not cut. */
function note(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${field} must be at most ${max} characters`);
  }
  return value.trim();
}

function secret(value: unknown, field: string, min: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[A-Za-z0-9_-]{${min},128}$`).test(value)) {
    throw new HttpsError('invalid-argument', `${field} is not valid`);
  }
  return value;
}

const INVITE_MAX = 64;
/** The length of an invite code the server hands out. */
export const VETTING_INVITE_CODE_LENGTH = 12;

/**
 * The invite code an apply link carried, if any. Any short string is taken (a wrong one is
 * simply not a live invite); absent or empty is none.
 */
function invite(d: Record<string, unknown>): { invite?: string } {
  const value = d.invite;
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string' || value.length > INVITE_MAX) {
    throw new HttpsError('invalid-argument', 'invite is not valid');
  }
  return { invite: value };
}

export function parseVettingCorp(data: unknown): { corporationId: number; invite?: string } {
  const d = record(data);
  return { corporationId: corporationId(d), ...invite(d) };
}

export interface VettingStartInput {
  corporationId: number;
  accessToken: string;
  invite?: string;
}

export function parseVettingStart(data: unknown): VettingStartInput {
  const d = record(data);
  return { corporationId: corporationId(d), accessToken: accessToken(d), ...invite(d) };
}

export function parseVettingInviteLabel(data: unknown): { label: string } {
  return { label: boundedString(record(data).label, 'label', VETTING_INVITE_LABEL_MAX) };
}

export function parseVettingInviteCode(data: unknown): { code: string } {
  const { code } = record(data);
  if (
    typeof code !== 'string' ||
    !new RegExp(`^[A-Za-z0-9_-]{${VETTING_INVITE_CODE_LENGTH}}$`).test(code)
  ) {
    throw new HttpsError('invalid-argument', 'code is not valid');
  }
  return { code };
}

/** Names a pilot's own review; the same shape the client keeps as its handle. */
export interface VettingHandle {
  corporationId: number;
  reviewId: string;
  key: string;
}

export function parseVettingHandle(data: unknown): VettingHandle {
  const d = record(data);
  return {
    corporationId: corporationId(d),
    reviewId: secret(d.reviewId, 'reviewId', 10),
    key: secret(d.key, 'key', 20),
  };
}

export function parseVettingAddCharacter(data: unknown): VettingHandle & { accessToken: string } {
  return { ...parseVettingHandle(data), accessToken: accessToken(record(data)) };
}

export function parseVettingRemoveCharacter(
  data: unknown
): VettingHandle & { characterId: number } {
  return {
    ...parseVettingHandle(data),
    characterId: int(record(data).characterId, 'characterId', 1, ID_MAX),
  };
}

export interface VettingSubmitInput extends VettingHandle {
  note: string;
  /** What the pilot typed, per question; settled against the corp's questions by the store. */
  answers: { questionId: string; answer: string }[];
}

export function parseVettingSubmit(data: unknown): VettingSubmitInput {
  const d = record(data);
  return {
    ...parseVettingHandle(data),
    note: note(d.note, 'note', VETTING_NOTE_MAX),
    answers: list(d.answers, 'answers', VETTING_QUESTIONS_MAX).map((entry) => {
      const given = record(entry);
      if (typeof given.answer !== 'string') {
        throw new HttpsError('invalid-argument', 'answers.answer must be a string');
      }
      return {
        questionId: boundedString(given.questionId, 'answers.questionId', QUESTION_ID_MAX),
        answer: note(given.answer, 'answers.answer', VETTING_ANSWER_MAX),
      };
    }),
  };
}

export function parseVettingMember(data: unknown): { accessToken: string } {
  return { accessToken: accessToken(record(data)) };
}

export function parseVettingReviewId(data: unknown): { reviewId: string } {
  return { reviewId: secret(record(data).reviewId, 'reviewId', 10) };
}

export interface VettingDecideInput {
  reviewId: string;
  decision: 'yes' | 'no';
  note: string;
}

export function parseVettingDecide(data: unknown): VettingDecideInput {
  const d = record(data);
  if (d.decision !== 'yes' && d.decision !== 'no') {
    throw new HttpsError('invalid-argument', 'decision must be yes or no');
  }
  return {
    ...parseVettingReviewId(data),
    decision: d.decision,
    note: note(d.note, 'note', VETTING_NOTE_MAX),
  };
}

export function parseVettingRequest(data: unknown): { memberName: string; role: string } {
  const d = record(data);
  return {
    memberName: boundedString(d.memberName, 'memberName', NAME_MAX),
    role: note(d.role, 'role', VETTING_ROLE_MAX),
  };
}

/** A question as a patch carries it: `id` absent on one the server has not seen yet. */
export interface VettingQuestionPatch {
  id?: string;
  label: string;
  required: boolean;
}

export interface VettingSettingsPatch {
  on?: boolean;
  signOffs?: Record<VettingKind, number>;
  removeWatch: number[];
  addWatchNames: string[];
  welcome?: string;
  contact?: string;
  /** The whole list, in order. */
  questions?: VettingQuestionPatch[];
  /** As sent; the store clamps them (`normalizeVettingSettings`). */
  minimums?: VettingMinimums;
  rejection?: VettingRejection;
  inviteOnly?: boolean;
  notifyReviewers?: boolean;
  mailDecision?: boolean;
}

/** A setting's text: longer than `max` is refused, not cut; empty clears it. */
function settingText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be a string`);
  }
  return note(value, field, max);
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', `${field} must be a boolean`);
  }
  return value;
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${field} must be a number`);
  }
  return value;
}

function question(value: unknown): VettingQuestionPatch {
  const d = record(value);
  return {
    ...(d.id === undefined || d.id === null
      ? {}
      : { id: boundedString(d.id, 'questions.id', QUESTION_ID_MAX) }),
    label: boundedString(d.label, 'questions.label', VETTING_QUESTION_MAX),
    required: d.required === undefined ? false : flag(d.required, 'questions.required'),
  };
}

/** Sign-offs a kind needs: a whole number, clamped to 1-3. */
function signOffCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${field} must be a number`);
  }
  return Math.min(3, Math.max(1, Math.round(value)));
}

function list(value: unknown, field: string, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be a list of at most ${max}`);
  }
  return value as unknown[];
}

export function parseVettingSettingsPatch(data: unknown): VettingSettingsPatch {
  const d = record(record(data).patch);
  const patch: VettingSettingsPatch = {
    removeWatch: list(d.removeWatch, 'removeWatch', 500).map((id) =>
      int(id, 'removeWatch', 1, ID_MAX)
    ),
    addWatchNames: [
      ...new Set(
        list(d.addWatchNames, 'addWatchNames', VETTING_WATCH_ADD_MAX).map((name) =>
          boundedString(name, 'addWatchNames', NAME_MAX)
        )
      ),
    ],
  };
  if (d.on !== undefined) {
    if (typeof d.on !== 'boolean') throw new HttpsError('invalid-argument', 'on must be a boolean');
    patch.on = d.on;
  }
  if (d.welcome !== undefined) {
    patch.welcome = settingText(d.welcome, 'welcome', VETTING_WELCOME_MAX);
  }
  if (d.contact !== undefined) {
    patch.contact = settingText(d.contact, 'contact', VETTING_CONTACT_MAX);
  }
  if (d.questions !== undefined) {
    patch.questions = list(d.questions, 'questions', VETTING_QUESTIONS_MAX).map(question);
  }
  if (d.minimums !== undefined) {
    const m = record(d.minimums);
    patch.minimums = {
      ageDays: finite(m.ageDays, 'minimums.ageDays'),
      skillPoints: finite(m.skillPoints, 'minimums.skillPoints'),
      characters: finite(m.characters, 'minimums.characters'),
    };
  }
  if (d.rejection !== undefined) {
    const r = record(d.rejection);
    if (r.wording !== 'rejected' && r.wording !== 'notNow') {
      throw new HttpsError('invalid-argument', 'rejection.wording must be rejected or notNow');
    }
    patch.rejection = {
      wording: r.wording,
      showReason: flag(r.showReason, 'rejection.showReason'),
    };
  }
  for (const key of ['inviteOnly', 'notifyReviewers', 'mailDecision'] as const) {
    if (d[key] !== undefined) patch[key] = flag(d[key], key);
  }
  if (d.signOffs !== undefined) {
    const counts = record(d.signOffs);
    patch.signOffs = {
      application: signOffCount(counts.application, 'signOffs.application'),
      promotion: signOffCount(counts.promotion, 'signOffs.promotion'),
    };
  }
  return patch;
}
