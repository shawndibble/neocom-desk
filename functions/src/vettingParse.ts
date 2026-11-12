// Vetting: callable input parsing. Pure; every refusal is `invalid-argument`.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { int } from './corpTaxBook.js';
import { VETTING_NOTE_MAX, type VettingKind } from './vettingEngine.js';
import { VETTING_ROLE_MAX, VETTING_WATCH_ADD_MAX } from './vettingTypes.js';

const ID_MAX = 2_147_483_647;
const TOKEN_MAX = 8192;
const NAME_MAX = 100;

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

export function parseVettingCorp(data: unknown): { corporationId: number } {
  return { corporationId: corporationId(record(data)) };
}

export interface VettingStartInput {
  corporationId: number;
  accessToken: string;
}

export function parseVettingStart(data: unknown): VettingStartInput {
  const d = record(data);
  return { corporationId: corporationId(d), accessToken: accessToken(d) };
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

export function parseVettingSubmit(data: unknown): VettingHandle & { note: string } {
  return { ...parseVettingHandle(data), note: note(record(data).note, 'note', VETTING_NOTE_MAX) };
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

export interface VettingSettingsPatch {
  on?: boolean;
  signOffs?: Record<VettingKind, number>;
  removeWatch: number[];
  addWatchNames: string[];
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
  if (d.signOffs !== undefined) {
    const counts = record(d.signOffs);
    patch.signOffs = {
      application: signOffCount(counts.application, 'signOffs.application'),
      promotion: signOffCount(counts.promotion, 'signOffs.promotion'),
    };
  }
  return patch;
}
