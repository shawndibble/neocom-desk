// Community Requests (issue #3807, ADR 0021): the pure half of the callables
// that post, extend, close and reopen a Request. A Request is a Member-owned
// document under `communities/{id}/itemRequests/{requestId}` (not `requests`,
// which already holds the Join Requests waiting for the admin). Creation is a
// callable because the open-Requests-per-Member and lines-per-Request caps
// cannot be counted by rules; the decisions live here, with no Firestore, so
// they are unit testable. The admin-SDK half is communityRequestsStore.ts.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, docId, record } from './communities.js';

export const REQUESTS_COLLECTION = 'itemRequests';
/** One Member's Pledges on a Request live in `{request}/pledges/{uid}` (issue #3808). */
export const PLEDGES_COLLECTION = 'pledges';

/** Open (not closed, not expired) Requests one Member may hold in one Community. */
export const MAX_OPEN_REQUESTS_PER_MEMBER = 10;
/** Lines on one Request. */
export const MAX_LINES_PER_REQUEST = 50;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
export const MAX_ITEM_NAME_LENGTH = 120;
/** A Request expires this long after its last activity; Extend restarts the clock. */
export const REQUEST_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** Far above any real stack; keeps a typo from becoming an unbounded number. */
export const MAX_LINE_QUANTITY = 1_000_000_000_000;

export type RequestLineKind = 'item' | 'bpc' | 'bpo';
const LINE_KINDS: readonly RequestLineKind[] = ['item', 'bpc', 'bpo'];

export interface RequestLine {
  typeId: number;
  name: string;
  quantity: number;
  kind: RequestLineKind;
  /** The ask on a BPC line; a delivery with other values still counts. */
  runs?: number;
  me?: number;
  te?: number;
}

export interface PostRequestInput {
  communityId: string;
  location: string;
  terms: string;
  lines: RequestLine[];
}

export interface RequestIdInput {
  communityId: string;
  requestId: string;
}

export interface SetClosedInput extends RequestIdInput {
  closed: boolean;
}

function positiveInt(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new HttpsError('invalid-argument', `${field} must be a whole number from 1 to ${max}`);
  }
  return value;
}

function optionalInt(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError(
      'invalid-argument',
      `${field} must be a whole number from ${min} to ${max}`
    );
  }
  return value;
}

/** Optional free text: trimmed, empty allowed, bounded. */
function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be text`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be at most ${max} characters`);
  }
  return text;
}

function parseLine(raw: unknown): RequestLine {
  const d = record(raw);
  const kind = d.kind === undefined ? 'item' : d.kind;
  if (!LINE_KINDS.includes(kind as RequestLineKind)) {
    throw new HttpsError('invalid-argument', 'line kind must be item, bpc or bpo');
  }
  const line: RequestLine = {
    typeId: positiveInt(d.typeId, 'typeId', 2_000_000_000),
    name: boundedString(d.name, 'name', MAX_ITEM_NAME_LENGTH),
    quantity: positiveInt(d.quantity, 'quantity', MAX_LINE_QUANTITY),
    kind: kind as RequestLineKind,
  };
  const runs = optionalInt(d.runs, 'runs', 1, 1_000_000);
  const me = optionalInt(d.me, 'me', 0, 10);
  const te = optionalInt(d.te, 'te', 0, 20);
  if (kind === 'bpc') {
    if (runs !== undefined) line.runs = runs;
    if (me !== undefined) line.me = me;
    if (te !== undefined) line.te = te;
  }
  return line;
}

export function parsePostRequestInput(data: unknown): PostRequestInput {
  const d = record(data);
  if (!Array.isArray(d.lines) || d.lines.length === 0) {
    throw new HttpsError('invalid-argument', 'a Request needs at least one line');
  }
  if (d.lines.length > MAX_LINES_PER_REQUEST) {
    throw new HttpsError(
      'resource-exhausted',
      `A Request holds at most ${MAX_LINES_PER_REQUEST} lines`,
      {
        reason: 'too-many-lines',
      }
    );
  }
  const lines = d.lines.map(parseLine);
  if (new Set(lines.map((l) => `${l.typeId}:${l.kind}`)).size !== lines.length) {
    throw new HttpsError('invalid-argument', 'a line is listed twice');
  }
  return {
    communityId: docId(d.communityId, 'communityId'),
    location: optionalText(d.location, 'location', MAX_LOCATION_LENGTH),
    terms: optionalText(d.terms, 'terms', MAX_TERMS_LENGTH),
    lines,
  };
}

export function parseRequestIdInput(data: unknown): RequestIdInput {
  const d = record(data);
  return {
    communityId: docId(d.communityId, 'communityId'),
    requestId: docId(d.requestId, 'requestId'),
  };
}

export function parseSetClosedInput(data: unknown): SetClosedInput {
  const d = record(data);
  if (typeof d.closed !== 'boolean') {
    throw new HttpsError('invalid-argument', 'closed must be true or false');
  }
  return { ...parseRequestIdInput(data), closed: d.closed };
}

/** Whether a stored Request still counts as open: not closed and not past its expiry. */
export function isOpenRequest(
  request: { closed: boolean; expiresAt: number },
  now: number
): boolean {
  return !request.closed && request.expiresAt > now;
}

export type PostDecision = 'ok' | 'too-many-open-requests';

export function decidePost(openCount: number): PostDecision {
  return openCount >= MAX_OPEN_REQUESTS_PER_MEMBER ? 'too-many-open-requests' : 'ok';
}

export type OwnerActionDecision =
  'ok' | 'not-found' | 'not-owner' | 'closed' | 'not-closed' | 'too-many-open-requests';

/** Extend: the owner's own, still-open Request (a closed one is reopened first). */
export function decideExtend(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  closed: boolean;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  if (state.ownerUid !== state.callerUid) return 'not-owner';
  return state.closed ? 'closed' : 'ok';
}

/**
 * Close or reopen. Reopening a Request counts against the open cap like
 * posting a new one; closing an already-closed Request (or reopening an open
 * one) is a harmless no-op, not an error.
 */
export function decideSetClosed(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  closed: boolean;
  wantClosed: boolean;
  openCount: number;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  if (state.ownerUid !== state.callerUid) return 'not-owner';
  if (!state.wantClosed && state.closed && state.openCount >= MAX_OPEN_REQUESTS_PER_MEMBER) {
    return 'too-many-open-requests';
  }
  return 'ok';
}

/** The next expiry: 30 days from `now`, never earlier than the one it already has. */
export function nextExpiry(now: number, current: number): number {
  return Math.max(current, now + REQUEST_LIFETIME_MS);
}
