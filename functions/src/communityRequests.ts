// Community Requests (issue #3807, ADR 0021): the pure half of the callables
// that post, extend, close and reopen a Request. A Request is a Member-owned
// document under `communities/{id}/itemRequests/{requestId}` (not `requests`,
// which already holds the Join Requests waiting for the admin). Creation is a
// callable because the open-Requests-per-Member and lines-per-Request caps
// cannot be counted by rules; the decisions live here, with no Firestore, so
// they are unit testable. The admin-SDK half is communityRequestsStore.ts.

import { HttpsError } from 'firebase-functions/v2/https';
import {
  MAIL_MAX_ATTEMPTS_PER_TARGET,
  MAIL_RESERVATION_STALE_MS,
  boundedString,
  docId,
  record,
  type MailInviteRecord,
} from './communities.js';

export const REQUESTS_COLLECTION = 'itemRequests';
/** One Member's Pledges on a Request live in `{request}/pledges/{uid}` (issue #3808, written by the Member under firestore.rules; this side only deletes them on leave). */
export const PLEDGES_COLLECTION = 'pledges';

/** Open (not closed, not expired) Requests one Member may hold in one Community. */
export const MAX_OPEN_REQUESTS_PER_MEMBER = 10;
/**
 * Mails one Member may send about Requests per UTC day (issue #3810): a mail
 * is a Pledge mail to one requester, however many lines it lists. Counted apart from
 * the 20 mail invites an admin sends (`MAX_MAIL_INVITES_PER_DAY`).
 */
export const MAX_REQUEST_MAILS_PER_DAY = 100;
/** Lines on one Request. */
export const MAX_LINES_PER_REQUEST = 50;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
export const MAX_ITEM_NAME_LENGTH = 120;
/** A Request expires this long after its last activity; Extend restarts the clock. */
export const REQUEST_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** A closed Request is deleted this long after it was closed (issue #3812). */
export const CLOSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** An expired Request is deleted this long after it expired, so the requester can still Extend it meanwhile (issue #3812). */
export const EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Far above any real stack; keeps a typo from becoming an unbounded number. */
export const MAX_LINE_QUANTITY = 1_000_000_000_000;

/**
 * Standing buyback Requests (issue #4780). Mirrors `src/engine/communities/buyback.ts`
 * (a parity test pins them): a rate in tenths of a percent, a basis, a Trade
 * Hub id, and buy lines that are an item type or one of a short list of groups.
 */
export const MIN_RATE = 1;
export const MAX_RATE = 200;
export const MAX_BUY_LINES = 50;
export const RATE_BASES = ['buy', 'sell'] as const;
export const BUYBACK_GROUP_KEYS = ['ore', 'ice', 'minerals', 'gas', 'pi', 'salvage'] as const;
export const BUYBACK_HUB_IDS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;

export type RateBasis = (typeof RATE_BASES)[number];
export type BuybackGroup = (typeof BUYBACK_GROUP_KEYS)[number];
export type BuybackHubId = (typeof BUYBACK_HUB_IDS)[number];
export type BuyLine =
  { kind: 'type'; typeId: number; name: string } | { kind: 'group'; group: BuybackGroup };

/** What makes a Request standing: it pays a rate, expires never, and asks for types or groups. */
export interface StandingTerms {
  rate: number;
  rateBasis: RateBasis;
  hubId: BuybackHubId;
  /** The Character contracts go to; absent means the requester's own. */
  buyerCharacterId?: number;
  buyLines: BuyLine[];
}

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

/**
 * How the requester wants to hear that someone Pledged: in the app (the bell),
 * by in-game mail from the Pledger, both or neither (the board alone). A
 * Request stored before this existed has no field and reads as the default.
 */
export interface RequestNotify {
  app: boolean;
  mail: boolean;
}

export const DEFAULT_NOTIFY: RequestNotify = { app: true, mail: false };

export interface PostRequestInput {
  communityId: string;
  location: string;
  terms: string;
  /** Empty on a standing Request, which asks through `standing.buyLines`. */
  lines: RequestLine[];
  notify: RequestNotify;
  standing?: StandingTerms;
}

/** An edit that omits `notify` (an older client) keeps the stored choice. */
export interface EditRequestInput extends Omit<PostRequestInput, 'notify'> {
  requestId: string;
  notify?: RequestNotify;
}

export interface RequestIdInput {
  communityId: string;
  requestId: string;
}

export interface RemovePledgeInput extends RequestIdInput {
  /** The Pledger's uid: the Pledge document's id. */
  pledgeUid: string;
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

/** A notification choice: two booleans and nothing else; absent means the default. */
export function parseNotify(raw: unknown): RequestNotify {
  if (raw === undefined || raw === null) return { ...DEFAULT_NOTIFY };
  const d = record(raw);
  if (
    typeof d.app !== 'boolean' ||
    typeof d.mail !== 'boolean' ||
    Object.keys(d).some((key) => key !== 'app' && key !== 'mail')
  ) {
    throw new HttpsError('invalid-argument', 'notify must be { app, mail } booleans');
  }
  return { app: d.app, mail: d.mail };
}

function parseBuyLine(raw: unknown): BuyLine {
  const d = record(raw);
  if (d.kind === 'group') {
    if (!BUYBACK_GROUP_KEYS.includes(d.group as BuybackGroup)) {
      throw new HttpsError('invalid-argument', 'unknown buyback group');
    }
    return { kind: 'group', group: d.group as BuybackGroup };
  }
  if (d.kind !== 'type') {
    throw new HttpsError('invalid-argument', 'buy line kind must be type or group');
  }
  return {
    kind: 'type',
    typeId: positiveInt(d.typeId, 'typeId', 2_000_000_000),
    name: boundedString(d.name, 'name', MAX_ITEM_NAME_LENGTH),
  };
}

const buyLineKey = (line: BuyLine) =>
  line.kind === 'type' ? `type:${line.typeId}` : `group:${line.group}`;

function parseStanding(d: Record<string, unknown>): StandingTerms {
  const { rate } = d;
  if (
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate < MIN_RATE ||
    rate > MAX_RATE ||
    Math.abs(rate * 10 - Math.round(rate * 10)) > 1e-9
  ) {
    throw new HttpsError(
      'invalid-argument',
      `rate must be a percent from ${MIN_RATE} to ${MAX_RATE} in tenths`
    );
  }
  if (!RATE_BASES.includes(d.rateBasis as RateBasis)) {
    throw new HttpsError('invalid-argument', 'rate basis must be buy or sell');
  }
  if (!BUYBACK_HUB_IDS.includes(d.hubId as BuybackHubId)) {
    throw new HttpsError('invalid-argument', 'unknown Trade Hub');
  }
  if (!Array.isArray(d.buyLines) || d.buyLines.length === 0) {
    throw new HttpsError('invalid-argument', 'a buyback needs at least one buy line');
  }
  if (d.buyLines.length > MAX_BUY_LINES) {
    throw new HttpsError('resource-exhausted', `A buyback holds at most ${MAX_BUY_LINES} lines`, {
      reason: 'too-many-lines',
    });
  }
  const buyLines = d.buyLines.map(parseBuyLine);
  if (new Set(buyLines.map(buyLineKey)).size !== buyLines.length) {
    throw new HttpsError('invalid-argument', 'a buy line is listed twice');
  }
  const buyer = optionalInt(d.buyerCharacterId, 'buyerCharacterId', 1, 2_000_000_000_000);
  return {
    rate,
    rateBasis: d.rateBasis as RateBasis,
    hubId: d.hubId as BuybackHubId,
    ...(buyer !== undefined ? { buyerCharacterId: buyer } : {}),
    buyLines,
  };
}

export function parsePostRequestInput(data: unknown): PostRequestInput {
  const d = record(data);
  if (d.standing === true) {
    return {
      communityId: docId(d.communityId, 'communityId'),
      location: optionalText(d.location, 'location', MAX_LOCATION_LENGTH),
      terms: optionalText(d.terms, 'terms', MAX_TERMS_LENGTH),
      lines: [],
      notify: parseNotify(d.notify),
      standing: parseStanding(d),
    };
  }
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
    notify: parseNotify(d.notify),
  };
}

export function parseEditRequestInput(data: unknown): EditRequestInput {
  const given = record(data).notify;
  const parsed: EditRequestInput = {
    ...parsePostRequestInput(data),
    requestId: docId(record(data).requestId, 'requestId'),
  };
  // Parsing fills in the default; an edit that said nothing must not apply it.
  if (given === undefined || given === null) delete parsed.notify;
  return parsed;
}

export function parseRequestIdInput(data: unknown): RequestIdInput {
  const d = record(data);
  return {
    communityId: docId(d.communityId, 'communityId'),
    requestId: docId(d.requestId, 'requestId'),
  };
}

export function parseRemovePledgeInput(data: unknown): RemovePledgeInput {
  const d = record(data);
  return { ...parseRequestIdInput(data), pledgeUid: docId(d.pledgeUid, 'pledgeUid') };
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
  request: { closed: boolean; expiresAt: number; standing?: boolean },
  now: number
): boolean {
  if (request.closed) return false;
  // A standing Request has no expiry: it stays open until its owner closes it.
  return request.standing === true || request.expiresAt > now;
}

export type PostDecision = 'ok' | 'too-many-open-requests';

export function decidePost(openCount: number): PostDecision {
  return openCount >= MAX_OPEN_REQUESTS_PER_MEMBER ? 'too-many-open-requests' : 'ok';
}

export type OwnerActionDecision =
  | 'ok'
  | 'not-found'
  | 'not-owner'
  | 'closed'
  | 'not-closed'
  | 'too-many-open-requests'
  | 'lines-locked';

/**
 * Whether an edit leaves the lines' identity alone: the same items, kinds and
 * order, with only quantity, runs, ME and TE free to change. Pledges are keyed
 * by line index, so once any exist the lines may not be added, removed,
 * reordered or swapped.
 */
export function sameLineSlots(
  before: readonly { typeId: number; kind: string }[],
  after: readonly { typeId: number; kind: string }[]
): boolean {
  return (
    before.length === after.length &&
    before.every((line, i) => line.typeId === after[i].typeId && line.kind === after[i].kind)
  );
}

/**
 * Edit: the owner's own, unclosed Request. Location and terms always change;
 * the lines only keep their slots once a Pledge exists on the Request.
 */
export function decideEdit(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  closed: boolean;
  hasPledges: boolean;
  slotsKept: boolean;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  if (state.ownerUid !== state.callerUid) return 'not-owner';
  if (state.closed) return 'closed';
  return state.hasPledges && !state.slotsKept ? 'lines-locked' : 'ok';
}

/**
 * Extend: the owner's own, unclosed Request (a closed one is reopened first).
 * Extending an expired one makes it open again, so it counts against the open
 * cap like a new post; extending one that is still open never can.
 */
export function decideExtend(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  closed: boolean;
  /** Whether it is open now: not closed and not past its expiry. */
  isOpen: boolean;
  /** The caller's open Requests in this Community, this one included when open. */
  openCount: number;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  if (state.ownerUid !== state.callerUid) return 'not-owner';
  if (state.closed) return 'closed';
  return !state.isOpen && state.openCount >= MAX_OPEN_REQUESTS_PER_MEMBER
    ? 'too-many-open-requests'
    : 'ok';
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

/** The Character id behind a `char:<id>` uid, or null for anything else. */
export function characterIdOfUid(uid: string): number | null {
  const match = /^char:(\d+)$/.exec(uid);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** How many lines a Pledge document's `lines` map has a quantity on. */
export function pledgedLineCount(lines: unknown): number {
  if (typeof lines !== 'object' || lines === null) return 0;
  return Object.values(lines).filter(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      Number((entry as { quantity?: unknown }).quantity) > 0
  ).length;
}

export type PledgeMailEligibility =
  'ok' | 'not-found' | 'own-request' | 'closed' | 'mail-off' | 'no-pledge';

/**
 * Whether a Pledger may mail the requester (the Pledge mail): the Request is
 * there and open, it is somebody else's, it asked for mail, and the caller has
 * a Pledge on it with a quantity. The recipient is the Request's owner, never
 * anything the client says.
 */
export function decidePledgeMail(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  isOpen: boolean;
  notifyMail: boolean;
  pledgedLines: number;
}): PledgeMailEligibility {
  if (!state.exists) return 'not-found';
  if (state.ownerUid === state.callerUid) return 'own-request';
  if (!state.isOpen) return 'closed';
  if (!state.notifyMail) return 'mail-off';
  return state.pledgedLines > 0 ? 'ok' : 'no-pledge';
}

/**
 * `retake` is free (the same UTC day's own reservation, left by a crashed tab).
 * `retake-charged` is a retake on a later UTC day: the old reservation was
 * counted on its own day, so today's count pays for the new send.
 */
export type RequestMailDecision =
  'ok' | 'retake' | 'retake-charged' | 'already-mailed' | 'daily-cap';

/**
 * One mail per recipient per Request comes first, so a repeat never reads as a
 * cap. A stale unconfirmed reservation may be retaken a few times
 * (`MAIL_MAX_ATTEMPTS_PER_TARGET`); across midnight it is charged to today and
 * held to today's cap. (The same rules as the mail invites'; see
 * `decideMailInvite` in communities.ts, which this mirrors on purpose.)
 */
export function decideRequestMail(state: {
  dailyCount: number;
  existing: (MailInviteRecord & { day?: string }) | null;
  now: number;
  /** Today's UTC day key. */
  day: string;
}): RequestMailDecision {
  const { existing } = state;
  if (existing) {
    const stale = state.now - existing.reservedAt >= MAIL_RESERVATION_STALE_MS;
    if (existing.sentAt !== null || !stale || existing.attempts >= MAIL_MAX_ATTEMPTS_PER_TARGET) {
      return 'already-mailed';
    }
    if (existing.day === undefined || existing.day === state.day) return 'retake';
    return state.dailyCount >= MAX_REQUEST_MAILS_PER_DAY ? 'daily-cap' : 'retake-charged';
  }
  return state.dailyCount >= MAX_REQUEST_MAILS_PER_DAY ? 'daily-cap' : 'ok';
}

export type SweepDecision = 'keep' | 'delete';

/**
 * The scheduled sweep's verdict on one Request (issue #3812). A closed Request
 * goes 7 days after `closedAt`, whatever its expiry (closing always stores
 * it); any other goes 7 days after its `expiresAt`, so it stays Expired, and
 * extendable by the requester, for that week. A malformed time is kept, never
 * guessed.
 */
export function decideRequestSweep(
  request: { closed: boolean; closedAt: number | null; expiresAt: number; standing?: boolean },
  now: number
): SweepDecision {
  if (request.closed && request.closedAt !== null) {
    return now - request.closedAt >= CLOSED_RETENTION_MS ? 'delete' : 'keep';
  }
  // A standing Request never expires; only closing it starts the clock.
  if (request.standing === true) return 'keep';
  if (!Number.isFinite(request.expiresAt)) return 'keep';
  return now - request.expiresAt >= EXPIRED_RETENTION_MS ? 'delete' : 'keep';
}
