import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { intIn, optionalIntIn } from './inputParse.js';
import {
  BUYBACK_GROUP_KEYS,
  BUYBACK_HUB_IDS,
  MAX_BUY_LINES,
  MAX_RATE,
  MIN_RATE,
  RATE_BASES,
  isValidRate,
  type BuybackGroup,
  type BuybackHubId,
  type RateBasis,
} from './buybackTerms.js';
import {
  MAIL_MAX_ATTEMPTS_PER_TARGET,
  MAIL_RESERVATION_STALE_MS,
  boundedString,
  docId,
  record,
  type MailInviteRecord,
} from './communities.js';

export const REQUESTS_COLLECTION = 'itemRequests';
export const PLEDGES_COLLECTION = 'pledges';

export const BOARD_VERSION_COLLECTION = 'boardVersion';
export const BOARD_VERSION_DOC = 'current';

export const boardVersionRef = (db: Firestore, communityId: string): DocumentReference =>
  db
    .collection('communities')
    .doc(communityId)
    .collection(BOARD_VERSION_COLLECTION)
    .doc(BOARD_VERSION_DOC);

export const boardVersionBump = (deleted = false) => {
  const at = FieldValue.serverTimestamp();
  return deleted ? { stamp: at, reset: at } : { stamp: at };
};

export const MAX_OPEN_REQUESTS_PER_MEMBER = 10;
export const MAX_REQUEST_MAILS_PER_DAY = 100;
export const MAX_LINES_PER_REQUEST = 50;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TERMS_LENGTH = 140;
export const MAX_ITEM_NAME_LENGTH = 120;
export const REQUEST_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const CLOSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_LINE_QUANTITY = 1_000_000_000_000;

export {
  BUYBACK_GROUP_KEYS,
  BUYBACK_HUB_IDS,
  MAX_BUY_LINES,
  MAX_RATE,
  MIN_RATE,
  RATE_BASES,
  type BuybackGroup,
  type BuybackHubId,
  type RateBasis,
} from './buybackTerms.js';

export type BuyLine =
  { kind: 'type'; typeId: number; name: string } | { kind: 'group'; group: BuybackGroup };

export interface StandingTerms {
  rate: number;
  rateBasis: RateBasis;
  hubId: BuybackHubId;
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
  runs?: number;
  me?: number;
  te?: number;
}

export interface RequestNotify {
  app: boolean;
  mail: boolean;
}

export const DEFAULT_NOTIFY: RequestNotify = { app: true, mail: false };

export interface PostRequestInput {
  communityId: string;
  location: string;
  terms: string;
  lines: RequestLine[];
  notify: RequestNotify;
  standing?: StandingTerms;
}

export interface EditRequestInput extends Omit<PostRequestInput, 'notify'> {
  requestId: string;
  notify?: RequestNotify;
}

export interface RequestIdInput {
  communityId: string;
  requestId: string;
}

export interface RemovePledgeInput extends RequestIdInput {
  pledgeUid: string;
}

export interface SetClosedInput extends RequestIdInput {
  closed: boolean;
}

const positiveInt = (value: unknown, field: string, max: number) => intIn(value, field, 1, max);

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
  const runs = optionalIntIn(d.runs, 'runs', 1, 1_000_000);
  const me = optionalIntIn(d.me, 'me', 0, 10);
  const te = optionalIntIn(d.te, 'te', 0, 20);
  if (kind === 'bpc') {
    if (runs !== undefined) line.runs = runs;
    if (me !== undefined) line.me = me;
    if (te !== undefined) line.te = te;
  }
  return line;
}

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
  if (!isValidRate(rate)) {
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
  const buyer = optionalIntIn(d.buyerCharacterId, 'buyerCharacterId', 1, 2_000_000_000_000);
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

export function isOpenRequest(
  request: { closed: boolean; expiresAt: number; standing?: boolean },
  now: number
): boolean {
  if (request.closed) return false;
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

export function sameLineSlots(
  before: readonly { typeId: number; kind: string }[],
  after: readonly { typeId: number; kind: string }[]
): boolean {
  return (
    before.length === after.length &&
    before.every((line, i) => line.typeId === after[i].typeId && line.kind === after[i].kind)
  );
}

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

export function decideExtend(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
  closed: boolean;
  isOpen: boolean;
  openCount: number;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  if (state.ownerUid !== state.callerUid) return 'not-owner';
  if (state.closed) return 'closed';
  return !state.isOpen && state.openCount >= MAX_OPEN_REQUESTS_PER_MEMBER
    ? 'too-many-open-requests'
    : 'ok';
}

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

export function nextExpiry(now: number, current: number): number {
  return Math.max(current, now + REQUEST_LIFETIME_MS);
}

export function characterIdOfUid(uid: string): number | null {
  const match = /^char:(\d+)$/.exec(uid);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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

export type RequestMailDecision =
  'ok' | 'retake' | 'retake-charged' | 'already-mailed' | 'daily-cap';

export function decideRequestMail(state: {
  dailyCount: number;
  existing: (MailInviteRecord & { day?: string }) | null;
  now: number;
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

export function decideRequestSweep(
  request: { closed: boolean; closedAt: number | null; expiresAt: number; standing?: boolean },
  now: number
): SweepDecision {
  if (request.closed && request.closedAt !== null) {
    return now - request.closedAt >= CLOSED_RETENTION_MS ? 'delete' : 'keep';
  }
  if (request.standing === true) return 'keep';
  if (!Number.isFinite(request.expiresAt)) return 'keep';
  return now - request.expiresAt >= EXPIRED_RETENTION_MS ? 'delete' : 'keep';
}
