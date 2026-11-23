// Corp Tax Book (issue #4061, epic #4055, ADR 0023): the pure half of the
// callables — layout constants, role decisions and input parsing — with no
// Firestore, so it is unit testable. The admin-SDK half is corpTaxBookStore.ts
// and the wiring is in index.ts.
//
// Firestore layout (rules in firestore.rules; every write is a callable):
//   corps/{corporationId}                settings: start date, hub, Ore Form, rates, grace,
//                                               notice rules, divisions, lastSync
//     officers/{uid}                            officer access record (24h) written by verifyOfficer
//     observed/{char_type_date_structure}       Observed Mining Entry rows, upserted monotonically
//     extractions/{structure_start}             Extractions, kept after ESI stops listing them
//     payments/{id}                             Tax Payments (donations found in the journal, manual);
//                                               read by its sender (`uid`)
//     dismissals/{id}  declarations/{id}  adjustments/{id}  writeOffs/{id}  rebills/{id}
//     lateNotices/{id}  lateNoticeLinks/{id}    Late notices and their verify tokens (decision 20261120-235011)
//     statements/{id}  statementLinks/{id}      legacy notices, read once by the one-time copy
//     accounts/{minerId}                        a Running account's figures and lock-date snapshot
//     miners/{minerId}                          Miner groupings
//     meta/paid                                 each Miner's paid-through day, only ever grown (D22)
//     meta/uncounted                            donations into divisions the book does not read (#6207)
//     audit/{at~rand}                           immutable audit log
//   corpTaxBookTokens/{token}                   verify-link tokens; no client access at all

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, docId, record } from './communities.js';
import { oneOf } from './inputParse.js';
import {
  BOOK_DEFAULTS,
  DIVISION_NAME_MAX,
  shiftDate,
  type ForfeitBasis,
} from './corpTaxBookEngine.js';
import { DAY_MS, HOUR_MS, MINUTE_MS, utcDay } from './timeConstants.js';
import { payOldestFirst, type OwedDay } from './corpTaxBookRunningAccounts.js';
import { matchesStatedTransfer } from './corpTaxBookTransferMatch.js';
import {
  NOTICE_ID_FIELD,
  finalNoticeId,
  isFinalNoticeId,
  minerPaymentCode,
  noticedDates,
  type LateNotice,
  type LateNoticeLine,
} from './corpTaxBookLateNotice.js';
import {
  checkpointFits,
  checkpointProblems,
  isSnapshot,
  snapshotThroughFor,
  type CheckpointProblem,
  type RunningAccountCheckpoint,
} from './corpTaxBookCheckpoint.js';
import { UNCOUNTED_LIMIT, type UncountedDonation } from './corpTaxBookSyncEngine.js';
import {
  MAX_POP_AUDIENCES,
  MAX_POP_NOTES,
  POP_SHARING_KEYS,
  POP_TIMES,
  audienceKey,
  type PopAudience,
  type PopSharingOverridePatch,
  type PopSharingSettings,
} from './popSharing.js';
import {
  CLAIM_CHECK_RESULTS,
  DISPUTE_KINDS,
  LIVE_CHECK_ACTION_NAMES,
  NOTICE_AFTER_KINDS,
  NOTICE_RULE_BOUNDS,
  PAYMENT_NOTE_MAX,
  TAX_CONTACT_MAX_CHARACTERS,
  TRANSFER_RECIPIENTS,
  type NoticeRules,
} from './corpTaxBookKinds.js';

export { CLAIM_CHECK_RESULTS, DISPUTE_KINDS, TAX_CONTACT_MAX_CHARACTERS, TRANSFER_RECIPIENTS };

// The book's subcollection names, declared once for both sides (corpTaxBookVersionKeys.ts).
export {
  OBSERVED,
  EXTRACTIONS,
  PAYMENTS,
  DISMISSALS,
  DECLARATIONS,
  DISPUTES,
  ADJUSTMENTS,
  WRITE_OFFS,
  TOLERANCE_EXEMPTIONS,
  MINER_PAID,
  REBILLS,
  STATEMENTS,
  STATEMENT_LINKS,
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  RUNNING_ACCOUNTS,
  MINERS,
  META,
} from './corpTaxBookVersionKeys.js';

/** The Tax Book lives under the `corps/{id}` umbrella (issue #4858, ADR 0026). */
export const BOOKS_COLLECTION = 'corps';
export { TOKENS_COLLECTION } from './corpTaxBookVersionKeys.js';

/**
 * How long a freshly turned-on book stays out of the members' own Mining Tax
 * page (no balances, donation notes or notices), so the officers can set the
 * rates, the sync and the payment matching up before anyone is told anything.
 */
export const MEMBER_SETUP_MS = 72 * 60 * 60 * 1000;
export const OFFICERS = 'officers';
export const PAID_DOC = 'paid';
/** Doc under `meta`: the scheduled sync's public status (ADR 0025); `status: 'active'` is Automatic sync on. */
export const SCHEDULED_SYNC_DOC = 'scheduledSync';
/** Doc under `meta`: the donations a sync noted in divisions the book does not read (#6207). */
export const UNCOUNTED_DOC = 'uncounted';
/** How many "not tax" answers to uncounted donations the doc keeps, so a sync never re-notes them. */
export const UNCOUNTED_IGNORED_MAX = 200;
export const AUDIT = 'audit';
/** `corps/{collector}/feeders/{feederCorp}`: a feeder's record (issue #4507). */
export const FEEDERS = 'feeders';
/** `corpTaxBookFeederInvites/{sha256(code)}`: invite links, function-only. */
export const FEEDER_INVITES_COLLECTION = 'corpTaxBookFeederInvites';
/**
 * `corpTaxBookFeederOf/{feederCorp}`: points a corporation that feeds a book at its
 * Collector, function-only. Lets "is this corporation a feeder?" be a plain read.
 */
export const FEEDER_OF_COLLECTION = 'corpTaxBookFeederOf';
/**
 * `corpTaxBookFeederPrevious/{feederCorp}`: `{ collectorCorporationId, leftAt }`, written when a
 * feeder leaves (the `FEEDER_OF` pointer is deleted then). Function-only; resolves the
 * Collector for the after-leaving view (issue #4512).
 */
export const FEEDER_PREVIOUS_COLLECTION = 'corpTaxBookFeederPrevious';
/**
 * `corpTaxBookRemovalLinks/{sha256(code)}`: the link in a removal's mail (issue #4520); only the
 * hash is stored. Function-only: a client never reads it.
 */
export const REMOVAL_LINKS_COLLECTION = 'corpTaxBookRemovalLinks';
/** `corps/{collector}/feederViews/{feederCorp}`: the moon owner's read model (issue #4512). */
export const FEEDER_VIEWS = 'feederViews';
/**
 * `corpTaxBookBilledBy/{char:id}`: which books bill a Character, `books[collectorCorp]`
 * the epoch ms of the last sync that saw them there. Written by the sync, readable by
 * that Character only, so a miner in a moon owner's corporation finds the book (#4517).
 */
export const BILLED_BY_COLLECTION = 'corpTaxBookBilledBy';

/** Roles are trusted for at most this long without a live check (D7). */
export const ROLE_CACHE_MS = 10 * MINUTE_MS;
/** Read access lapses this long after the last check (D7). */
export const ACCESS_TTL_MS = DAY_MS;

export const MAX_SYNC_OBSERVED = 2000;
export const MAX_SYNC_EXTRACTIONS = 200;
export const MAX_SYNC_DONATIONS = 500;
export const MAX_RATES = 500;
/** The largest Late notice (or legacy Statement) one call stores, as JSON: under Firestore's 1 MiB. */
export const MAX_NOTICE_JSON = 900_000;

const VIEW_ROLES = ['Director', 'Accountant', 'Junior_Accountant'];
const EDIT_ROLES = ['Director', 'Accountant'];

/** What a Character may do in a corporation's book, from its ESI roles (D8). */
export interface OfficerRoles {
  isCeo: boolean;
  isDirector: boolean;
  isStationManager: boolean;
  canView: boolean;
  canEdit: boolean;
}

export function decideRoles(roles: readonly string[], isCeo: boolean): OfficerRoles {
  const has = (list: readonly string[]) => list.some((r) => roles.includes(r));
  return {
    isCeo,
    isDirector: isCeo || roles.includes('Director'),
    isStationManager: isCeo || has(['Director', 'Station_Manager']),
    canView: isCeo || has(VIEW_ROLES),
    canEdit: isCeo || has(EDIT_ROLES),
  };
}

/** `corps/{corp}/officers/{uid}`. */
export interface OfficerAccess extends OfficerRoles {
  characterId: number;
  characterName: string;
  ownerHash: string;
  corporationId: number;
  roles: string[];
  checkedAt: number;
  /** Rules let this officer read the book until then. */
  expiresAt: number;
}

export type Need = 'view' | 'edit' | 'director' | 'ceo';

export function satisfies(roles: OfficerRoles, need: Need): boolean {
  switch (need) {
    case 'view':
      return roles.canView;
    case 'edit':
      return roles.canEdit;
    case 'director':
      return roles.isDirector;
    case 'ceo':
      return roles.isCeo;
  }
}

export function isCacheFresh(checkedAt: number, now: number): boolean {
  return now - checkedAt <= ROLE_CACHE_MS && checkedAt <= now + MINUTE_MS;
}

// --- Input parsing --------------------------------------------------------

export function int(value: unknown, field: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError('invalid-argument', `${field} must be a whole number ${min}-${max}`);
  }
  return value;
}

function num(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpsError('invalid-argument', `${field} must be a number ${min}-${max}`);
  }
  return value;
}

/** A rate in percent: a finite number 0-100. */
export function pctField(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new HttpsError('invalid-argument', `${name} must be 0-100`);
  }
  return value;
}

export function dateString(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value : '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T00:00:00Z`) : NaN;
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== text) {
    throw new HttpsError('invalid-argument', `${field} must be a YYYY-MM-DD date`);
  }
  return text;
}

function instant(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value : '';
  if (text.length > 40 || Number.isNaN(Date.parse(text))) {
    throw new HttpsError('invalid-argument', `${field} must be an ISO-8601 instant`);
  }
  return new Date(text).toISOString();
}

function list(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be a list of at most ${max}`);
  }
  return value;
}

const CORP_ID_MAX = 2_147_483_647;

/** Every book callable names its corporation and may carry the short-lived access token. */
export interface BookCall {
  corporationId: number;
  /** An EVE access token (never a refresh token). Required for live checks. */
  accessToken?: string;
}

export function parseBookCall(data: unknown): BookCall {
  const d = record(data);
  const accessToken =
    d.accessToken === undefined ? undefined : boundedString(d.accessToken, 'accessToken', 8192);
  return { corporationId: int(d.corporationId, 'corporationId', 1, CORP_ID_MAX), accessToken };
}

/** A book call about one of its moon owners. */
export interface FeederTargetCall extends BookCall {
  feederCorporationId: number;
}

export function parseFeederTarget(data: unknown): FeederTargetCall {
  const id = record(data).feederCorporationId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'feederCorporationId must be a corporation id');
  }
  return { ...parseBookCall(data), feederCorporationId: id };
}

export interface TurnOnInput extends BookCall {
  startDate: string;
  /** The corp-default rate, dated at the start date. */
  startRatePct: number;
}

export function parseTurnOnInput(data: unknown): TurnOnInput {
  const d = record(data);
  return {
    ...parseBookCall(data),
    startDate: dateString(d.startDate, 'startDate'),
    startRatePct: num(d.startRatePct, 'startRatePct', 0, 100),
  };
}

export type StoredRate =
  | { scope: 'corp' | 'guest'; pct: number; effectiveFrom: string }
  | { scope: 'miner'; minerId: string; pct: number; effectiveFrom: string }
  | { scope: 'moon'; moonId: number; pct: number; effectiveFrom: string }
  | { scope: 'structure'; structureId: number; pct: number; effectiveFrom: string }
  | { scope: 'feeder' | 'feeder-member'; feederId: number; pct: number; effectiveFrom: string }
  | { scope: 'record'; recordKey: string; pct: number };

/** The most rates one `addRates` takes. */
const MAX_BATCH_RATES = 50;

export function parseDatedRate(data: unknown): Exclude<StoredRate, { scope: 'record' }> {
  const d = record(data);
  const scope = oneOf(d.scope, 'scope', [
    'corp',
    'guest',
    'miner',
    'moon',
    'structure',
    'feeder',
    'feeder-member',
  ] as const);
  const base = {
    pct: num(d.pct, 'pct', 0, 100),
    effectiveFrom: dateString(d.effectiveFrom, 'effectiveFrom'),
  };
  if (scope === 'miner') return { scope, minerId: docId(d.minerId, 'minerId'), ...base };
  if (scope === 'moon') return { scope, moonId: int(d.moonId, 'moonId'), ...base };
  // A refinery by structure id (#4621): a moon owner's ledger-only rows never carry a moon.
  if (scope === 'structure')
    return { scope, structureId: int(d.structureId, 'structureId'), ...base };
  // Every refinery of one moon owner corporation: the miner rate chain's per-feeder tier.
  // Every refinery of one moon owner corporation, for its own members only (#6210): above the
  // Guest default they would otherwise mine its moon at.
  if (scope === 'feeder' || scope === 'feeder-member')
    return { scope, feederId: int(d.feederId, 'feederId'), ...base };
  return { scope, ...base };
}

const RECORD_KEY = /^\d+:\d+:\d{4}-\d{2}-\d{2}$/;
export function parseRecordKey(value: unknown): { characterId: number; date: string; key: string } {
  const key = typeof value === 'string' ? value : '';
  if (!RECORD_KEY.test(key)) {
    throw new HttpsError('invalid-argument', 'recordKey must be character:refinery:date');
  }
  const [character, , date] = key.split(':');
  return { characterId: Number(character), date: dateString(date, 'recordKey date'), key };
}

export interface SettingsPatch {
  hubId?: string;
  oreForm?: 'compressed' | 'raw';
  graceHours?: number;
  overdueDays?: number;
  divisions?: number[];
  /**
   * The stored `divisions` this patch's `divisions` was built from. When set, the edit is
   * refused (`divisions-changed`) if the stored list has since changed, so one officer's save
   * never silently drops another's change. Older clients omit it: their list is stored as-is.
   */
  divisionsBase?: number[];
  /**
   * The division members are asked to pay into first. It must be one of the divisions the book
   * reads once the edit lands; the book still credits a donation into any of them.
   */
  primaryDivision?: number;
  /**
   * One division to add to the stored list inside the edit's transaction ("Count division"), so
   * two officers counting different divisions at once both land. When set, `divisions` in the
   * same patch is ignored: a client sends it only for a server that predates `addDivision`.
   * Its `divisionNames` merge into the stored names rather than replace them, for the same reason.
   */
  addDivision?: number;
  /**
   * The corp's own names for its wallet divisions, by division "1".."7" (#6161): a Director's
   * client reads them with its ordinary corp login and pushes them, so a member's Settle up can
   * name the Account to pick. Replaces the stored map whole; `{}` clears it.
   */
  divisionNames?: Record<string, string>;
  chunkM3PerHour?: number;
  structureExpiryHours?: Record<string, number>;
  dismissApprovalAboveIsk?: number | null;
  /** Who gets the EVE mail when a member asks about tax; `null` clears it (the CEO then). */
  taxContact?: TaxContact | null;
  /** Move the book's start (Director): earlier freely, later only over unbilled days. */
  startDate?: string;
  /** End the member setup window now (Director): `membersSeeFrom` becomes the call time. */
  showToMembers?: true;
  /** A running account's late notices. */
  noticeRules?: NoticeRules;
  /** A running account's per-day tolerance, in percent. */
  dayTolerancePct?: number;
}

function parseNoticeRules(raw: unknown): NoticeRules {
  const d = record(raw);
  const a = record(d.after);
  const kind = oneOf(a.kind, 'noticeRules.after.kind', NOTICE_AFTER_KINDS);
  const b = NOTICE_RULE_BOUNDS;
  return {
    after:
      kind === 'behind'
        ? { kind, days: int(a.days, 'noticeRules.after.days', b.behindDays.min, b.behindDays.max) }
        : { kind, day: int(a.day, 'noticeRules.after.day', b.dayOfMonth.min, b.dayOfMonth.max) },
    minimum: num(d.minimum, 'noticeRules.minimum', b.minimum.min, b.minimum.max),
    cooldownDays: int(
      d.cooldownDays,
      'noticeRules.cooldownDays',
      b.cooldownDays.min,
      b.cooldownDays.max
    ),
    ...(d.earlyAt !== undefined && d.earlyAt !== null
      ? { earlyAt: num(d.earlyAt, 'noticeRules.earlyAt', b.earlyAt.min, b.earlyAt.max) }
      : {}),
  };
}

/** The mirror of the client's `TaxContact` (`src/engine/corpTaxBook/bookDocs.ts`). */
export type TaxContact =
  { kind: 'mailingList'; id: number; name: string } | { kind: 'characters'; ids: number[] };

function parseTaxContact(value: unknown): TaxContact {
  const c = record(value);
  if (c.kind === 'mailingList') {
    return {
      kind: 'mailingList',
      id: int(c.id, 'taxContact.id'),
      name: boundedString(c.name, 'taxContact.name', 100),
    };
  }
  if (c.kind === 'characters') {
    const ids = list(c.ids, 'taxContact.ids', TAX_CONTACT_MAX_CHARACTERS).map((x) =>
      int(x, 'taxContact id')
    );
    const unique = [...new Set(ids)];
    if (unique.length === 0)
      throw new HttpsError('invalid-argument', 'taxContact needs a character');
    return { kind: 'characters', ids: unique };
  }
  throw new HttpsError('invalid-argument', 'taxContact.kind must be mailingList or characters');
}

const HUBS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;

function parseDivisionNames(value: unknown): Record<string, string> {
  if (Array.isArray(value)) throw new HttpsError('invalid-argument', 'divisionNames must be a map');
  const names: Record<string, string> = {};
  for (const [division, name] of Object.entries(record(value))) {
    if (!/^[1-7]$/.test(division)) {
      throw new HttpsError('invalid-argument', 'divisionNames keys must be divisions 1-7');
    }
    names[division] = boundedString(name, 'division name', DIVISION_NAME_MAX);
  }
  return names;
}

/** A wallet divisions list: 1-7, de-duplicated, ascending. */
function parseDivisions(value: unknown, field: string): number[] {
  const divisions = list(value, field, 7).map((x) => int(x, 'division', 1, 7));
  return [...new Set(divisions)].sort((a, b) => a - b);
}

/** Whether two divisions lists name the same divisions, whatever their order or repeats. */
export function sameDivisions(a: readonly number[], b: readonly number[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((d) => y.has(d));
}

export function parseSettingsPatch(data: unknown): SettingsPatch {
  const d = record(data);
  const patch: SettingsPatch = {};
  if (d.hubId !== undefined) patch.hubId = oneOf(d.hubId, 'hubId', HUBS);
  if (d.oreForm !== undefined)
    patch.oreForm = oneOf(d.oreForm, 'oreForm', ['compressed', 'raw'] as const);
  if (d.graceHours !== undefined) patch.graceHours = num(d.graceHours, 'graceHours', 0, 72);
  if (d.overdueDays !== undefined) patch.overdueDays = int(d.overdueDays, 'overdueDays', 1, 365);
  if (d.divisions !== undefined) {
    patch.divisions = parseDivisions(d.divisions, 'divisions');
    if (patch.divisions.length === 0)
      throw new HttpsError('invalid-argument', 'divisions cannot be empty');
  }
  if (d.divisionsBase !== undefined) {
    if (patch.divisions === undefined)
      throw new HttpsError('invalid-argument', 'divisionsBase needs divisions');
    patch.divisionsBase = parseDivisions(d.divisionsBase, 'divisionsBase');
  }
  if (d.primaryDivision !== undefined)
    patch.primaryDivision = int(d.primaryDivision, 'primaryDivision', 1, 7);
  if (d.addDivision !== undefined) {
    if (patch.divisionsBase !== undefined)
      throw new HttpsError('invalid-argument', 'addDivision takes no divisionsBase');
    patch.addDivision = int(d.addDivision, 'addDivision', 1, 7);
  }
  if (d.divisionNames !== undefined) patch.divisionNames = parseDivisionNames(d.divisionNames);
  if (d.chunkM3PerHour !== undefined) {
    patch.chunkM3PerHour = num(d.chunkM3PerHour, 'chunkM3PerHour', 1, 1e7);
  }
  if (d.structureExpiryHours !== undefined) {
    const map = record(d.structureExpiryHours);
    const entries = Object.entries(map);
    if (entries.length > 100) throw new HttpsError('invalid-argument', 'too many structures');
    patch.structureExpiryHours = {};
    for (const [id, hours] of entries) {
      patch.structureExpiryHours[String(int(Number(id), 'structure id'))] = num(
        hours,
        'expiry hours',
        1,
        96
      );
    }
  }
  if (d.dismissApprovalAboveIsk !== undefined) {
    patch.dismissApprovalAboveIsk =
      d.dismissApprovalAboveIsk === null
        ? null
        : num(d.dismissApprovalAboveIsk, 'dismissApprovalAboveIsk', 0, 1e13);
  }
  if (d.taxContact !== undefined) {
    patch.taxContact = d.taxContact === null ? null : parseTaxContact(d.taxContact);
  }
  if (d.startDate !== undefined) patch.startDate = dateString(d.startDate, 'startDate');
  if (d.showToMembers !== undefined) {
    if (d.showToMembers !== true)
      throw new HttpsError('invalid-argument', 'showToMembers must be true');
    patch.showToMembers = true;
  }
  if (d.noticeRules !== undefined) patch.noticeRules = parseNoticeRules(d.noticeRules);
  if (d.dayTolerancePct !== undefined)
    patch.dayTolerancePct = num(d.dayTolerancePct, 'dayTolerancePct', 0, 5);
  if (Object.keys(patch).length === 0)
    throw new HttpsError('invalid-argument', 'no settings given');
  return patch;
}

/**
 * Why a book's start date cannot move from `oldStart` to `newStart`, else null. Never the
 * future, never before a former moon owner's leave day (`floor`); moving later is allowed
 * only while no Late notice listed a day in the gap (`noticedDates`), so billed days stay billed.
 */
export function startDateMoveReason(
  oldStart: string,
  newStart: string,
  today: string,
  floor: string | null,
  notices: Parameters<typeof noticedDates>[0]
): 'start-in-future' | 'start-before-leave' | 'start-over-billed' | null {
  if (newStart > today) return 'start-in-future';
  if (floor !== null && newStart < floor) return 'start-before-leave';
  if (newStart > oldStart) {
    const billed = noticedDates(notices);
    for (let d = oldStart; d < newStart; d = shiftDate(d, 1))
      if (billed.has(d)) return 'start-over-billed';
  }
  return null;
}

export const rateKey = (r: StoredRate): string =>
  r.scope === 'record'
    ? `record:${r.recordKey}`
    : `${r.scope}:${'minerId' in r ? r.minerId : ''}:${'moonId' in r ? r.moonId : ''}:${r.effectiveFrom}` +
      (r.scope === 'structure' ? `:${r.structureId}` : '') +
      (r.scope === 'feeder' || r.scope === 'feeder-member' ? `:${r.feederId}` : '');

/**
 * The rates after the start date moves earlier: the corp-default rate dated at the old start is
 * re-dated to the new one. A rate already at the new date (same `rateKey`) is replaced, never
 * doubled, as `addRate` does.
 */
export function moveStartRate(
  rates: readonly StoredRate[],
  oldStart: string,
  newStart: string
): StoredRate[] {
  const moved = rates.map((r) =>
    r.scope === 'corp' && r.effectiveFrom === oldStart ? { ...r, effectiveFrom: newStart } : r
  );
  const last = new Map(moved.map((r, i) => [rateKey(r), i]));
  return moved.filter((r, i) => last.get(rateKey(r)) === i);
}

export type EditAction =
  | { action: 'addRate'; rate: ReturnType<typeof parseDatedRate> }
  /** #6323: several rates in one all-or-nothing write; each is audited as its own `addRate`. */
  | { action: 'addRates'; rates: ReturnType<typeof parseDatedRate>[] }
  | { action: 'setRecordRate'; recordKey: string; pct: number; reason: string }
  | { action: 'updateSettings'; patch: SettingsPatch }
  | {
      action: 'recordPayment';
      paymentId: string;
      minerId: string;
      characterId: number;
      amount: number;
      at: string;
      note?: string;
      /** The Declaration this payment confirms, in the same write (one resolution per declaration). */
      declarationId?: string;
    }
  | { action: 'markNotTax'; paymentId: string; notTaxAmount: number; reason?: string }
  | {
      action: 'assignPayment';
      paymentId: string;
      minerId: string;
      /** The Declaration this donation match confirms, in the same write. */
      declarationId?: string;
    }
  /** An officer moves a payment to another Miner, or back to Unmatched with `null`. */
  | { action: 'reassignPayment'; paymentId: string; minerId: string | null }
  /** #6207: an officer says a donation into a division the book does not read is not tax. */
  | { action: 'ignoreUncounted'; uncountedId: string }
  | {
      action: 'dismiss';
      scope: 'record' | 'miner' | 'moon' | 'extraction';
      targetId: string;
      reason: string;
      amountIsk?: number;
    }
  | {
      action: 'dismissRecords';
      /** Several days at once; the approval limit is checked on their total (#4194). */
      targets: { targetId: string; amountIsk: number }[];
      reason: string;
    }
  | { action: 'reverseDismissal'; dismissalId: string; reason: string }
  /**
   * Links a Moon Ore Survey (a Share Link id) as a chunk's ore source, or unlinks it with null (D13).
   * `surveyScan` keeps its first scan on the Extraction, so the make-up outlives the Survey's link.
   */
  | {
      action: 'linkSurvey';
      extractionId: string;
      surveyId: string | null;
      surveyScan?: SurveyScanSnapshot;
    }
  /** Flags an Extraction Fully Mined (who and when kept) or clears it (#5257). Both are audited. */
  | { action: 'setFullyMined'; extractionId: string; fullyMined: boolean }
  | { action: 'setMiner'; minerId: string; characterIds: number[]; mainCharacterId: number }
  | {
      /** `leftOn`: the day the Character left (a sale); mining and donations before it stay put. */
      action: 'unlink';
      minerId: string;
      characterId: number;
      leftOn?: string;
    }
  | {
      /** Folds stored Miners into one, atomically (#4194): the "Group with…" dialog's single call. */
      action: 'regroupMiner';
      minerId: string;
      characterIds: number[];
      mainCharacterId: number;
      absorbMinerIds: string[];
    }
  | {
      action: 'addAdjustment';
      minerId: string;
      date: string;
      amount: number;
      reason: string;
      /** `opening`: the balance rolled over from another system. */
      kind?: 'opening';
    }
  /** Undoes a correction: the record stays, marked reversed. Refused once a Statement billed it. */
  | { action: 'reverseAdjustment'; adjustmentId: string; reason: string }
  /** Reverses a correction and adds its replacement in one step. */
  | {
      action: 'editAdjustment';
      adjustmentId: string;
      date: string;
      amount: number;
      reason: string;
    }
  | { action: 'reverseWriteOff'; writeOffId: string; reason: string }
  /** How much of one Miner-day's shortfall the book forgives (0 charges it all). */
  | {
      action: 'setToleranceExemption';
      minerId: string;
      date: string;
      forgive: number;
      reason: string;
    }
  /** Forgives the Miner's oldest unpaid days (decision 20261120-235011): it names no notice. */
  | { action: 'writeOff'; minerId: string; amount: number; reason: string }
  | { action: 'rebill'; minerId: string; fromDate: string; reason: string }
  | {
      action: 'closeAccount';
      minerId: string;
      reason: string;
      /** The final Late notice, issued in the same write. Absent when nothing is left to bill. */
      notice?: LateNotice;
      /** Credit is refunded unless the guest consented or went 90 days without replying. */
      credit: CloseCredit;
      /**
       * A running account's credit as the officer's client works it out (#6294): money ahead of
       * every day. The server cannot price days, so it takes this on such a book.
       */
      runningCredit?: number;
    }
  | { action: 'issueLateNotice'; notice: LateNotice }
  /** An officer-recorded declaration. It carries the Miner's `uids`, so its note is theirs to read. */
  | {
      action: 'declare';
      noticeId: string;
      kind: 'contract' | 'other-division' | 'wrong-corp';
      note?: string;
    }
  /**
   * `nextStep`: what the member should do now, shown to them word for word. The app requires it;
   * the server accepts its absence until every deployed client sends it (production's client is
   * older than this function).
   */
  | { action: 'rejectDispute'; disputeId: string; reason: string; nextStep?: string }
  /**
   * Waives only the disputed ore (#6206): a credit Adjustment on the day, not a dismissal of the
   * whole record. The server prices it from the Statements that billed the day; `amountIsk`, the
   * client's figure, counts only for a day not billed yet, and then as over the Director limit.
   */
  | {
      action: 'dismissDispute';
      disputeId: string;
      minerId: string;
      amountIsk?: number;
      reason: string;
    }
  | {
      action: 'resolveDeclaration';
      declarationId: string;
      resolution: 'confirmed' | 'rejected';
      reason?: string;
      /** A rejection's next step for the member (see `rejectDispute`). */
      nextStep?: string;
    }
  | { action: 'recordReminder'; noticeId: string }
  /** Pop Sharing (#6222): the switch and the Sharing default. Turning it on needs Automatic sync. */
  | { action: 'setPopSharing'; enabled?: boolean; defaults?: Partial<PopSharingSettings> }
  /** One moon's overrides; null returns a setting to the Sharing default. */
  | { action: 'setPopSharingMoon'; moonId: number; override: PopSharingOverridePatch }
  | { action: 'recordLateNoticeMail'; noticeId: string; mailId: number; kind: LateNoticeMailKind }
  /**
   * A running account's figures per Miner, as the officer's client works them out (#6294), each
   * with its snapshot for the lock date when one is due; the server sets the snapshot's `at`,
   * `by` and readers.
   */
  | { action: 'recordAccounts'; accounts: RecordedRunningAccount[] };

/** A Late notice's first mail, or a reminder of it. */
export type LateNoticeMailKind = 'notice' | 'reminder';

/** A checkpoint as an officer's tab sends it: the server adds `at` and `by`. */
export type RecordedCheckpoint = Omit<RunningAccountCheckpoint, 'at' | 'by'>;

/** What a Miner owes on a running account, as one officer's client worked it out. */
export interface RecordedRunningAccount {
  minerId: string;
  owed: number;
  /** The Miner's net payments (less "not tax") the client counted: later ones come off `owed`. */
  paid: number;
  days: number;
  oldest?: string;
  paidThrough?: string;
  /** The running days still owed, oldest first (what the verify page lists); absent from an older client. */
  unpaidDays?: OwedDay[];
  /**
   * The newest day the officer's client says is paid for good (D22), stored in `meta/paid`. Only
   * ever moves forward. The server has no prices, so it can't check the day was priced at a saved
   * close-of-day price; it trusts the client for that and checks only what it can see.
   */
  settledThrough?: string;
  /** Money ahead of every billed day, as the client counted it; absent from an older client. */
  credit?: number;
  /** The account through the day before the lock date, when one is due (`checkpointRefusal`). */
  snapshot?: RecordedCheckpoint;
}

export type CloseCredit = { kind: 'refund' } | { kind: 'forfeit'; basis: ForfeitBasis };

/** Dismissals, write-offs, rebills and "not tax" re-check the role live (D7). */
export const LIVE_CHECK_ACTIONS: ReadonlySet<EditAction['action']> = new Set(
  LIVE_CHECK_ACTION_NAMES satisfies readonly EditAction['action'][]
);

/** A close that forfeits credit writes value off, so it re-checks the role live too (#4184). */
export function needsLiveCheck(action: EditAction): boolean {
  return (
    LIVE_CHECK_ACTIONS.has(action.action) ||
    (action.action === 'closeAccount' && action.credit.kind === 'forfeit')
  );
}

/**
 * Whether a dismissal needs a Director (D6): the approval limit applies to the
 * total dismissed in one act, so a multi-day dismissal cannot slip under it
 * day by day. An omitted or zero amount counts as over the limit: a zero is a day whose
 * charge the client did not have in view, not a free dismissal.
 */
export function dismissalNeedsDirector(
  limit: number | null | undefined,
  amounts: readonly (number | undefined)[],
  isDirector: boolean
): boolean {
  if (isDirector || typeof limit !== 'number') return false;
  const total = amounts.reduce<number>(
    (sum, a) => sum + (a !== undefined && a > 0 ? a : Infinity),
    0
  );
  return total > limit;
}

const reason = (v: unknown) => boundedString(v, 'reason', 500);
/** Optional reason: absent or blank stores nothing. */
const optReason = (v: unknown) =>
  v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : reason(v);
const optNote = (v: unknown) =>
  v === undefined ? undefined : boundedString(v, 'note', PAYMENT_NOTE_MAX);
const optNextStep = (v: unknown) =>
  v === undefined ? undefined : boundedString(v, 'nextStep', 500);
/** A linked Survey's first scan as the book keeps it (engine `SurveyScanSnapshot`). */
export interface SurveyScanSnapshot {
  at?: number;
  volumeM3: number;
  ores: { typeId: number; volumeM3: number }[];
}

const MAX_SURVEY_ORES = 50;

function surveyScanOf(raw: unknown): SurveyScanSnapshot {
  const s = record(raw);
  return {
    ...(s.at === undefined ? {} : { at: num(s.at, 'surveyScan.at', 0, 1e15) }),
    volumeM3: num(s.volumeM3, 'surveyScan.volumeM3', 0, 1e12),
    ores: list(s.ores, 'surveyScan.ores', MAX_SURVEY_ORES).map((o) => {
      const ore = record(o);
      return {
        typeId: int(ore.typeId, 'surveyScan.typeId'),
        volumeM3: num(ore.volumeM3, 'surveyScan.volumeM3', 0, 1e12),
      };
    }),
  };
}

/** A Late notice's id, as `noticeId` or by the old name an older client still sends. */
const noticeIdOf = (d: Record<string, unknown>) =>
  docId(d.noticeId ?? d[NOTICE_ID_FIELD], 'noticeId');
const money = (v: unknown, f: string) => num(v, f, 0.01, 1e13);

function parseCloseCredit(raw: unknown): CloseCredit {
  const c = record(raw);
  if (oneOf(c.kind, 'credit.kind', ['refund', 'forfeit'] as const) === 'refund')
    return { kind: 'refund' };
  const b = record(c.basis);
  return oneOf(b.kind, 'basis.kind', ['consent', 'no-reply'] as const) === 'consent'
    ? { kind: 'forfeit', basis: { kind: 'consent', note: boundedString(b.note, 'note', 500) } }
    : { kind: 'forfeit', basis: { kind: 'no-reply', askedAt: dateString(b.askedAt, 'askedAt') } };
}

export function parseEditAction(data: unknown): EditAction {
  const d = record(data);
  const action = oneOf(d.action, 'action', [
    'addRate',
    'addRates',
    'setRecordRate',
    'updateSettings',
    'recordPayment',
    'markNotTax',
    'assignPayment',
    'reassignPayment',
    'ignoreUncounted',
    'dismiss',
    'dismissRecords',
    'reverseDismissal',
    'linkSurvey',
    'setFullyMined',
    'setMiner',
    'unlink',
    'regroupMiner',
    'addAdjustment',
    'reverseAdjustment',
    'editAdjustment',
    'reverseWriteOff',
    'setToleranceExemption',
    'writeOff',
    'rebill',
    'closeAccount',
    'issueLateNotice',
    'declare',
    'resolveDeclaration',
    'rejectDispute',
    'dismissDispute',
    'recordReminder',
    'recordLateNoticeMail',
    'recordAccounts',
    'setPopSharing',
    'setPopSharingMoon',
  ] as const);
  switch (action) {
    case 'addRate':
      return { action, rate: parseDatedRate(d.rate) };
    case 'addRates': {
      const rates = list(d.rates, 'rates', MAX_BATCH_RATES).map(parseDatedRate);
      if (rates.length === 0) throw new HttpsError('invalid-argument', 'rates must not be empty');
      return { action, rates };
    }
    case 'setRecordRate':
      return {
        action,
        recordKey: parseRecordKey(d.recordKey).key,
        pct: num(d.pct, 'pct', 0, 100),
        reason: reason(d.reason),
      };
    case 'updateSettings':
      return { action, patch: parseSettingsPatch(d.patch) };
    case 'recordPayment':
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        minerId: docId(d.minerId, 'minerId'),
        characterId: int(d.characterId, 'characterId'),
        amount: money(d.amount, 'amount'),
        at: instant(d.at, 'at'),
        // An older tab may still name a notice: money pays the oldest day, so it is not stored.
        note: optNote(d.note),
        ...(d.declarationId !== undefined
          ? { declarationId: docId(d.declarationId, 'declarationId') }
          : {}),
      };
    case 'markNotTax': {
      const why = optReason(d.reason);
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        notTaxAmount: num(d.notTaxAmount, 'notTaxAmount', 0, 1e13),
        ...(why !== undefined ? { reason: why } : {}),
      };
    }
    case 'assignPayment':
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        minerId: docId(d.minerId, 'minerId'),
        ...(d.declarationId !== undefined
          ? { declarationId: docId(d.declarationId, 'declarationId') }
          : {}),
      };
    case 'reassignPayment':
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        minerId: d.minerId === null ? null : docId(d.minerId, 'minerId'),
      };
    case 'ignoreUncounted':
      return { action, uncountedId: docId(d.uncountedId, 'uncountedId') };
    case 'dismiss':
      return {
        action,
        scope: oneOf(d.scope, 'scope', ['record', 'miner', 'moon', 'extraction'] as const),
        targetId: boundedString(d.targetId, 'targetId', 128),
        reason: reason(d.reason),
        amountIsk: d.amountIsk === undefined ? undefined : num(d.amountIsk, 'amountIsk', 0, 1e13),
      };
    case 'dismissRecords': {
      const targets = list(d.targets, 'targets', 200).map((x) => {
        const t = record(x);
        return {
          targetId: boundedString(t.targetId, 'targetId', 128),
          amountIsk: num(t.amountIsk, 'amountIsk', 0, 1e13),
        };
      });
      if (targets.length === 0) throw new HttpsError('invalid-argument', 'no days given');
      return { action, targets, reason: reason(d.reason) };
    }
    case 'reverseDismissal':
      return { action, dismissalId: docId(d.dismissalId, 'dismissalId'), reason: reason(d.reason) };
    case 'linkSurvey': {
      const surveyId = d.surveyId === null ? null : docId(d.surveyId, 'surveyId');
      return {
        action,
        extractionId: docId(d.extractionId, 'extractionId'),
        surveyId,
        // Kept with a link only: an unlink drops it with the link.
        ...(surveyId !== null && d.surveyScan !== undefined
          ? { surveyScan: surveyScanOf(d.surveyScan) }
          : {}),
      };
    }
    case 'setFullyMined':
      if (typeof d.fullyMined !== 'boolean')
        throw new HttpsError('invalid-argument', 'fullyMined must be true or false');
      return {
        action,
        extractionId: docId(d.extractionId, 'extractionId'),
        fullyMined: d.fullyMined,
      };
    case 'setMiner': {
      const characterIds = [
        ...new Set(list(d.characterIds, 'characterIds', 50).map((x) => int(x, 'characterId'))),
      ];
      const mainCharacterId = int(d.mainCharacterId, 'mainCharacterId');
      if (characterIds.length === 0 || !characterIds.includes(mainCharacterId)) {
        throw new HttpsError('invalid-argument', 'the main must be one of the characters');
      }
      return { action, minerId: docId(d.minerId, 'minerId'), characterIds, mainCharacterId };
    }
    case 'regroupMiner': {
      const characterIds = [
        ...new Set(list(d.characterIds, 'characterIds', 50).map((x) => int(x, 'characterId'))),
      ];
      const mainCharacterId = int(d.mainCharacterId, 'mainCharacterId');
      if (characterIds.length === 0 || !characterIds.includes(mainCharacterId)) {
        throw new HttpsError('invalid-argument', 'the main must be one of the characters');
      }
      const minerId = docId(d.minerId, 'minerId');
      const absorbMinerIds = [
        ...new Set(list(d.absorbMinerIds, 'absorbMinerIds', 50).map((x) => docId(x, 'minerId'))),
      ];
      if (absorbMinerIds.includes(minerId)) {
        throw new HttpsError('invalid-argument', 'a Miner cannot absorb itself');
      }
      return { action, minerId, characterIds, mainCharacterId, absorbMinerIds };
    }
    case 'unlink':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        characterId: int(d.characterId, 'characterId'),
        ...(d.leftOn !== undefined ? { leftOn: dateString(d.leftOn, 'leftOn') } : {}),
      };
    case 'addAdjustment':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        date: dateString(d.date, 'date'),
        amount: num(d.amount, 'amount', -1e13, 1e13),
        reason: reason(d.reason),
        ...(d.kind === 'opening' ? { kind: 'opening' as const } : {}),
      };
    case 'reverseAdjustment':
      return {
        action,
        adjustmentId: docId(d.adjustmentId, 'adjustmentId'),
        reason: reason(d.reason),
      };
    case 'editAdjustment':
      return {
        action,
        adjustmentId: docId(d.adjustmentId, 'adjustmentId'),
        date: dateString(d.date, 'date'),
        amount: num(d.amount, 'amount', -1e13, 1e13),
        reason: reason(d.reason),
      };
    case 'reverseWriteOff':
      return {
        action,
        writeOffId: docId(d.writeOffId, 'writeOffId'),
        reason: reason(d.reason),
      };
    case 'setToleranceExemption':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        date: dateString(d.date, 'date'),
        forgive: num(d.forgive, 'forgive', 0, 1e13),
        reason: reason(d.reason),
      };
    case 'writeOff':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        amount: money(d.amount, 'amount'),
        reason: reason(d.reason),
      };
    case 'rebill':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        fromDate: dateString(d.fromDate, 'fromDate'),
        reason: reason(d.reason),
      };
    case 'issueLateNotice': {
      const notice = record(d.notice);
      if (JSON.stringify(notice).length > MAX_NOTICE_JSON)
        throw new HttpsError('invalid-argument', 'notice is too large');
      return { action, notice: parseLateNotice(notice) };
    }
    case 'closeAccount': {
      const notice = d.notice === undefined ? undefined : record(d.notice);
      if (notice && JSON.stringify(notice).length > MAX_NOTICE_JSON) {
        throw new HttpsError('invalid-argument', 'notice is too large');
      }
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        reason: reason(d.reason),
        ...(notice ? { notice: parseLateNotice(notice, 'final') } : {}),
        credit: parseCloseCredit(d.credit),
        ...(d.runningCredit !== undefined
          ? { runningCredit: num(d.runningCredit, 'runningCredit', 0, 1e13) }
          : {}),
      };
    }
    case 'declare':
      return {
        action,
        noticeId: noticeIdOf(d),
        kind: oneOf(d.kind, 'kind', ['contract', 'other-division', 'wrong-corp'] as const),
        note: optNote(d.note),
      };
    case 'resolveDeclaration': {
      const resolution = oneOf(d.resolution, 'resolution', ['confirmed', 'rejected'] as const);
      const nextStep = resolution === 'rejected' ? optNextStep(d.nextStep) : undefined;
      return {
        action,
        declarationId: docId(d.declarationId, 'declarationId'),
        resolution,
        reason: resolution === 'rejected' ? reason(d.reason) : optNote(d.reason),
        ...(nextStep !== undefined ? { nextStep } : {}),
      };
    }
    case 'rejectDispute': {
      const nextStep = optNextStep(d.nextStep);
      return {
        action,
        disputeId: docId(d.disputeId, 'disputeId'),
        reason: reason(d.reason),
        ...(nextStep !== undefined ? { nextStep } : {}),
      };
    }
    case 'dismissDispute':
      return {
        action,
        disputeId: docId(d.disputeId, 'disputeId'),
        minerId: docId(d.minerId, 'minerId'),
        ...(d.amountIsk !== undefined ? { amountIsk: money(d.amountIsk, 'amountIsk') } : {}),
        reason: reason(d.reason),
      };
    case 'recordReminder':
      return { action, noticeId: noticeIdOf(d) };
    case 'setPopSharing': {
      if (d.enabled !== undefined && typeof d.enabled !== 'boolean')
        throw new HttpsError('invalid-argument', 'enabled must be true or false');
      const defaults = d.defaults === undefined ? undefined : popSettingsPatch(d.defaults, false);
      if (defaults && Object.keys(defaults).length === 0)
        throw new HttpsError('invalid-argument', 'nothing to change');
      if (d.enabled === undefined && defaults === undefined)
        throw new HttpsError('invalid-argument', 'nothing to change');
      return {
        action,
        ...(d.enabled === undefined ? {} : { enabled: d.enabled }),
        ...(defaults ? { defaults } : {}),
      };
    }
    case 'setPopSharingMoon': {
      const set = d.set === undefined ? {} : popSettingsPatch(d.set, true);
      const clear = [
        ...new Set(
          list(d.clear ?? [], 'clear', POP_SHARING_KEYS.length).map((k) =>
            oneOf(k, 'clear', POP_SHARING_KEYS)
          )
        ),
      ];
      if (Object.keys(set).length + clear.length === 0)
        throw new HttpsError('invalid-argument', 'nothing to change');
      if (clear.some((k) => k in set))
        throw new HttpsError('invalid-argument', 'a setting cannot be set and cleared');
      return { action, moonId: int(d.moonId, 'moonId'), override: { set, clear } };
    }
    case 'recordLateNoticeMail':
      return {
        action,
        noticeId: docId(d.noticeId, 'noticeId'),
        mailId: int(d.mailId, 'mailId', 1, Number.MAX_SAFE_INTEGER),
        kind: oneOf(d.kind, 'kind', ['notice', 'reminder'] as const),
      };
    case 'recordAccounts':
      return {
        action,
        accounts: list(d.accounts, 'accounts', 200).map((raw) => {
          const a = record(raw);
          return {
            minerId: docId(a.minerId, 'minerId'),
            owed: num(a.owed, 'owed', 0, 1e13),
            paid: num(a.paid, 'paid', 0, 1e15),
            days: int(a.days, 'days', 0, 100_000),
            ...(a.oldest !== undefined ? { oldest: dateString(a.oldest, 'oldest') } : {}),
            ...(a.paidThrough !== undefined
              ? { paidThrough: dateString(a.paidThrough, 'paidThrough') }
              : {}),
            ...(a.unpaidDays !== undefined
              ? {
                  unpaidDays: list(a.unpaidDays, 'unpaidDays', 1000).map((rawDay) => {
                    const day = record(rawDay);
                    return {
                      date: dateString(day.date, 'unpaidDays.date'),
                      owed: num(day.owed, 'unpaidDays.owed', 0, 1e13),
                      tax: num(day.tax, 'unpaidDays.tax', 0, 1e13),
                    };
                  }),
                }
              : {}),
            ...(a.settledThrough !== undefined
              ? { settledThrough: dateString(a.settledThrough, 'settledThrough') }
              : {}),
            ...(a.credit !== undefined ? { credit: num(a.credit, 'credit', 0, 1e15) } : {}),
            ...(a.snapshot !== undefined
              ? { snapshot: parseCheckpoint({ ...record(a.snapshot), minerId: a.minerId }) }
              : {}),
          };
        }),
      };
  }
}

function popAudience(raw: unknown): PopAudience {
  const a = record(raw);
  const kind = oneOf(a.kind, 'audience.kind', ['corp', 'alliance', 'community'] as const);
  if (kind !== 'community') return { kind };
  return {
    kind,
    communityId: docId(a.communityId, 'communityId'),
    name: boundedString(a.name, 'community name', 100),
  };
}

/**
 * Pop Sharing settings from a client (#6222): only known settings, each validated. A null
 * `ratePct` is the book's own rate.
 */
function popSettingsPatch(raw: unknown, allowEmpty: boolean): Partial<PopSharingSettings> {
  const p = record(raw);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(p)) {
    if (!(POP_SHARING_KEYS as readonly string[]).includes(key))
      throw new HttpsError('invalid-argument', `unknown setting ${key}`);
  }
  for (const key of POP_SHARING_KEYS) {
    const v = p[key];
    if (v === undefined) continue;
    switch (key) {
      case 'audiences': {
        const audiences = list(v, 'audiences', MAX_POP_AUDIENCES).map(popAudience);
        if (new Set(audiences.map(audienceKey)).size !== audiences.length)
          throw new HttpsError('invalid-argument', 'an audience is listed twice');
        out.audiences = audiences;
        break;
      }
      case 'popTime':
        out.popTime = oneOf(v, 'popTime', POP_TIMES);
        break;
      case 'showOre':
        if (typeof v !== 'boolean')
          throw new HttpsError('invalid-argument', 'showOre must be true or false');
        out.showOre = v;
        break;
      case 'ratePct':
        out.ratePct = v === null ? null : pctField(v, 'ratePct');
        break;
      case 'notes': {
        if (typeof v !== 'string' || v.trim().length > MAX_POP_NOTES)
          throw new HttpsError('invalid-argument', `notes must be 0-${MAX_POP_NOTES} characters`);
        out.notes = v.trim();
        break;
      }
    }
  }
  if (!allowEmpty && Object.keys(out).length === 0)
    throw new HttpsError('invalid-argument', 'nothing to change');
  return out as Partial<PopSharingSettings>;
}

/**
 * The names the guest verify page prints (#4066): a guest cannot look up a
 * structure's name, so the officer's client stores them on the Statement.
 * Bounded and typed here rather than stored as given.
 */
function displayNames(raw: Record<string, unknown>) {
  const out: {
    corporationName?: string;
    minerName?: string;
    refineryNames?: Record<string, string>;
  } = {};
  if (raw.corporationName !== undefined)
    out.corporationName = boundedString(raw.corporationName, 'corporationName', 100);
  if (raw.minerName !== undefined) out.minerName = boundedString(raw.minerName, 'minerName', 100);
  if (raw.refineryNames !== undefined) {
    const entries = Object.entries(record(raw.refineryNames));
    if (entries.length > 50) throw new HttpsError('invalid-argument', 'too many refineries');
    out.refineryNames = {};
    for (const [id, name] of entries) {
      out.refineryNames[String(int(Number(id), 'refinery id'))] = boundedString(
        name,
        'refinery name',
        200
      );
    }
  }
  return out;
}

const LINE_KINDS = ['mined', 'late-ore', 'correction'] as const;

function parseNoticeLine(raw: unknown): LateNoticeLine {
  const l = record(raw);
  const opt = <T>(v: unknown, parse: (x: unknown) => T) => (v === undefined ? undefined : parse(v));
  const characterId = opt(l.characterId, (x) => int(x, 'line.characterId'));
  const structureId = opt(l.structureId, (x) => int(x, 'line.structureId'));
  const unitPrices = opt(l.unitPrices, (x) => {
    const out: Record<number, number> = {};
    for (const [id, price] of Object.entries(record(x)))
      out[int(Number(id), 'unitPrices type id')] = num(price, 'unitPrice', 0, 1e13);
    return out;
  });
  const priceSources = opt(l.priceSources, (x) => {
    const out: Record<number, string> = {};
    for (const [id, source] of Object.entries(record(x)))
      out[int(Number(id), 'priceSources type id')] = boundedString(source, 'priceSource', 40);
    return out;
  });
  const taxPct = opt(l.taxPct, (x) => pctField(x, 'line.taxPct'));
  const rateEffectiveFrom = opt(l.rateEffectiveFrom, (x) => dateString(x, 'rateEffectiveFrom'));
  const why = opt(l.reason, reason);
  return {
    kind: oneOf(l.kind, 'line.kind', LINE_KINDS),
    date: dateString(l.date, 'line.date'),
    key: boundedString(l.key, 'line.key', 200),
    ...(characterId !== undefined ? { characterId } : {}),
    ...(structureId !== undefined ? { structureId } : {}),
    oreLines: list(l.oreLines ?? [], 'line.oreLines', 100).map((o) => {
      const ore = record(o);
      return {
        typeId: int(ore.typeId, 'typeId'),
        quantity: num(ore.quantity, 'quantity', 0, 1e13),
      };
    }),
    ...(unitPrices !== undefined ? { unitPrices } : {}),
    ...(priceSources !== undefined ? { priceSources } : {}),
    estimatedValue: num(l.estimatedValue, 'line.estimatedValue', -1e15, 1e15),
    ...(taxPct !== undefined ? { taxPct } : {}),
    ...(rateEffectiveFrom !== undefined ? { rateEffectiveFrom } : {}),
    ...(why !== undefined ? { reason: why } : {}),
    tax: num(l.tax, 'line.tax', -1e13, 1e13),
  };
}

/**
 * A Late notice from an officer's tab (decision 20261120-235011). What it listed is summed here
 * from its lines, and its Reason code is the Miner's one code (`minerPaymentCode`), as the mail
 * asks for; who may read it, who issued it
 * and its mail state are the server's to set, so they start empty. A final notice is issued only
 * by closing the account (`kind` 'final'), under the Miner's final id (`finalNoticeId`).
 */
export function parseLateNotice(
  raw: Record<string, unknown>,
  kind: LateNotice['kind'] = 'late'
): LateNotice {
  const id = docId(raw.id, 'notice.id');
  const minerId = docId(raw.minerId, 'notice.minerId');
  oneOf(raw.kind, 'notice.kind', [kind]);
  if (kind === 'late' && isFinalNoticeId(id))
    throw new HttpsError('invalid-argument', 'only closing an account sends a final notice');
  if (kind === 'final' && id !== finalNoticeId(minerId))
    throw new HttpsError('invalid-argument', `notice.id must be ${finalNoticeId(minerId)}`);
  const code = minerPaymentCode(minerId);
  if (raw.code !== undefined && raw.code !== code)
    throw new HttpsError('invalid-argument', `notice.code must be ${code}`);
  const lines = list(raw.lines, 'notice.lines', 5000).map(parseNoticeLine);
  const pricing =
    raw.pricing === undefined
      ? undefined
      : {
          hubId: oneOf(record(raw.pricing).hubId, 'pricing.hubId', HUBS),
          oreForm: oneOf(record(raw.pricing).oreForm, 'pricing.oreForm', [
            'compressed',
            'raw',
          ] as const),
        };
  const names = raw.names === undefined ? {} : displayNames(record(raw.names));
  return {
    id,
    minerId,
    characterIds: list(raw.characterIds, 'notice.characterIds', 50).map((x) =>
      int(x, 'characterId')
    ),
    kind,
    issuedAt: instant(raw.issuedAt, 'notice.issuedAt'),
    code,
    ...(pricing !== undefined ? { pricing } : {}),
    uids: [],
    lines,
    listed: lines.reduce((sum, l) => sum + l.tax, 0),
    mail: { sent: 0, manualSent: 0, remindersStopped: false },
    ...(Object.keys(names).length > 0 ? { names } : {}),
  };
}

/** Why a checkpoint from a tab is not stored. */
export type CheckpointRefusal =
  'wrong-date' | 'exists' | CheckpointProblem | 'unknown-miner' | 'characters-changed';

/**
 * Why a snapshot is not stored, undefined when it is (decision 20261120-235011, "a lock date"):
 * one per Miner per lock date, through `snapshotThroughFor(today)` (`wrong-date`), unless a stored
 * snapshot already covers that day (`exists`). It must add up (`checkpointProblems`), name a Miner
 * the book knows, and have summed that Miner's characters as they are now (`checkpointFits`).
 * A stored checkpoint for other characters, or one the strict cache recorded through days still
 * open (`isSnapshot`), is no snapshot: it is replaced.
 */
export function checkpointRefusal(
  k: RecordedCheckpoint,
  ctx: {
    stored?: Pick<RunningAccountCheckpoint, 'through' | 'at' | 'characterIds'>;
    today: string;
    known: boolean;
    /** The Miner's characters now. */
    characterIds: readonly number[];
  }
): CheckpointRefusal | undefined {
  if (k.through !== snapshotThroughFor(ctx.today)) return 'wrong-date';
  const { stored } = ctx;
  if (
    stored &&
    stored.through >= k.through &&
    typeof stored.at === 'string' &&
    isSnapshot(stored) &&
    checkpointFits(stored, ctx.characterIds)
  )
    return 'exists';
  const problem = checkpointProblems(k)[0];
  if (problem) return problem;
  if (!ctx.known) return 'unknown-miner';
  if (!checkpointFits(k, ctx.characterIds)) return 'characters-changed';
  return undefined;
}

/** A checkpoint from an officer's tab; `checkpointRefusal` decides whether it is stored. */
export function parseCheckpoint(raw: unknown): RecordedCheckpoint {
  const c = record(raw);
  return {
    minerId: docId(c.minerId, 'minerId'),
    through: dateString(c.through, 'through'),
    owed: list(c.owed, 'owed', 1000).map((x) => {
      const day = record(x);
      const opt = (key: string, max: number) =>
        day[key] === undefined ? {} : { [key]: num(day[key], `owed.${key}`, 0, max) };
      if (day.held !== undefined && typeof day.held !== 'boolean')
        throw new HttpsError('invalid-argument', 'owed.held must be true or false');
      return {
        date: dateString(day.date, 'owed.date'),
        remaining: num(day.remaining, 'owed.remaining', 0, 1e13),
        tax: num(day.tax, 'owed.tax', 0, 1e13),
        credited: num(day.credited, 'owed.credited', 0, 1e13),
        ...opt('writtenOff', 1e13),
        ...opt('charge', 1e13),
        ...(day.held === true ? { held: true } : {}),
      };
    }),
    credit: num(c.credit, 'credit', 0, 1e15),
    balance: num(c.balance, 'balance', -1e15, 1e15),
    paidThrough: c.paidThrough === null ? null : dateString(c.paidThrough, 'paidThrough'),
    characterIds: [
      ...new Set(list(c.characterIds, 'characterIds', 50).map((x) => int(x, 'characterId'))),
    ],
  };
}

export interface SyncInput extends BookCall {
  observed: {
    structureId: number;
    characterId: number;
    recordedCorporationId: number;
    typeId: number;
    date: string;
    quantity: number;
    cachedAt: string;
    solarSystemId?: number;
    moonId?: number;
    sourceCorporationId?: number;
  }[];
  extractions: {
    structureId: number;
    moonId: number;
    extractionStartTime: string;
    chunkArrivalTime: string;
    naturalDecayTime: string;
    laserFiredAt?: string;
    cancelledAt?: string;
    oreLines?: { typeId: number; quantity: number }[];
  }[];
  donations: {
    refId: number;
    division: number;
    characterId: number;
    amount: number;
    at: string;
    reason?: string;
    /** A client's hint that a known sender's Miner owed nothing, so it waits for review (#6207). */
    reviewReason?: 'no-open-balance';
  }[];
  gaps: { structureId: number; from: string; to: string }[];
  /**
   * #6207: donations the sync noted in divisions the book does not read; replaces the stored
   * list. Absent when the sync did not read those divisions, which leaves the list as it was.
   */
  uncounted?: UncountedDonation[];
  /**
   * Whether this sync read the book's wallet divisions for donations. Sent on a sync's first call
   * only; absent from its overflow calls and from older clients, which leave the record as it was.
   */
  donationsRead?: boolean;
}

export function parseSyncInput(data: unknown, nowMs: number): SyncInput {
  const d = record(data);
  const today = utcDay(nowMs);
  const observed = list(d.observed ?? [], 'observed', MAX_SYNC_OBSERVED).map((r) => {
    const row = record(r);
    const date = dateString(row.date, 'date');
    const cachedAt = instant(row.cachedAt, 'cachedAt');
    if (date > today || Date.parse(cachedAt) > nowMs + HOUR_MS) {
      throw new HttpsError('invalid-argument', 'observed rows cannot be from the future');
    }
    return {
      structureId: int(row.structureId, 'structureId'),
      characterId: int(row.characterId, 'characterId'),
      recordedCorporationId: int(
        row.recordedCorporationId,
        'recordedCorporationId',
        0,
        CORP_ID_MAX
      ),
      typeId: int(row.typeId, 'typeId'),
      date,
      quantity: int(row.quantity, 'quantity', 0, 1e12),
      cachedAt,
      ...(row.solarSystemId === undefined
        ? {}
        : { solarSystemId: int(row.solarSystemId, 'solarSystemId', 30_000_000, 32_000_000) }),
      ...(row.moonId === undefined ? {} : { moonId: int(row.moonId, 'moonId') }),
      ...(row.sourceCorporationId === undefined
        ? {}
        : {
            sourceCorporationId: int(
              row.sourceCorporationId,
              'sourceCorporationId',
              1,
              CORP_ID_MAX
            ),
          }),
    };
  });
  const extractions = list(d.extractions ?? [], 'extractions', MAX_SYNC_EXTRACTIONS).map((r) => {
    const x = record(r);
    return {
      structureId: int(x.structureId, 'structureId'),
      moonId: int(x.moonId, 'moonId'),
      extractionStartTime: instant(x.extractionStartTime, 'extractionStartTime'),
      chunkArrivalTime: instant(x.chunkArrivalTime, 'chunkArrivalTime'),
      naturalDecayTime: instant(x.naturalDecayTime, 'naturalDecayTime'),
      laserFiredAt:
        x.laserFiredAt === undefined ? undefined : instant(x.laserFiredAt, 'laserFiredAt'),
      cancelledAt: x.cancelledAt === undefined ? undefined : instant(x.cancelledAt, 'cancelledAt'),
      oreLines:
        x.oreLines === undefined
          ? undefined
          : list(x.oreLines, 'oreLines', 50).map((l) => {
              const line = record(l);
              return {
                typeId: int(line.typeId, 'typeId'),
                quantity: int(line.quantity, 'quantity', 0, 1e12),
              };
            }),
    };
  });
  const donations = list(d.donations ?? [], 'donations', MAX_SYNC_DONATIONS).map((r) => {
    const x = record(r);
    return {
      refId: int(x.refId, 'refId'),
      division: int(x.division, 'division', 1, 7),
      characterId: int(x.characterId, 'characterId'),
      amount: money(x.amount, 'amount'),
      at: instant(x.at, 'at'),
      reason: x.reason === undefined ? undefined : String(x.reason).slice(0, 200),
      // Whose money it is, the server decides (corpTaxBookDonationMatch.ts): a client's Miner or
      // notice is not read. #6207: a known sender's donation held for review; only on one the
      // client matched to no Miner.
      reviewReason:
        x.reviewReason === 'no-open-balance' && x.minerId === undefined
          ? ('no-open-balance' as const)
          : undefined,
    };
  });
  const gaps = list(d.gaps ?? [], 'gaps', 20).map((r) => {
    const g = record(r);
    return {
      structureId: int(g.structureId, 'structureId'),
      from: dateString(g.from, 'from'),
      to: dateString(g.to, 'to'),
    };
  });
  const uncounted =
    d.uncounted === undefined
      ? undefined
      : list(d.uncounted, 'uncounted', UNCOUNTED_LIMIT).map((r) => {
          const x = record(r);
          const division = int(x.division, 'division', 1, 7);
          const refId = int(x.refId, 'refId');
          return {
            id: `j${division}_${refId}`,
            refId,
            division,
            characterId: int(x.characterId, 'characterId'),
            amount: money(x.amount, 'amount'),
            at: instant(x.at, 'at'),
          };
        });
  return {
    ...parseBookCall(data),
    observed,
    extractions,
    donations,
    gaps,
    ...(uncounted ? { uncounted } : {}),
    ...(typeof d.donationsRead === 'boolean' ? { donationsRead: d.donationsRead } : {}),
  };
}

/**
 * The book's `donationsReadAt` after a sync: when a sync last read the wallet's donations, which
 * members' "not credited" notes wait on, so a sync that could not read it (no role, no scope)
 * never reads as one the donation missed. Stamped by a sync that read it; null while none has
 * (`stored` absent); left as it was by an older client's call or a sync's overflow call.
 */
export function donationsReadAtPatch(
  donationsRead: boolean | undefined,
  stored: unknown,
  now: number
): { donationsReadAt?: number | null } {
  if (donationsRead === true) return { donationsReadAt: now };
  if (donationsRead === false && stored === undefined) return { donationsReadAt: null };
  return {};
}

export interface TokenInput {
  token: string;
}
export function parseToken(data: unknown): string {
  const token = boundedString(record(data).token, 'token', 128);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpsError('not-found', 'Verify link is not valid');
  return token;
}

export function parseStopReminders(data: unknown): { token: string; stopped: boolean } {
  const d = record(data);
  if (typeof d.stopped !== 'boolean')
    throw new HttpsError('invalid-argument', 'stopped must be true or false');
  return { token: parseToken(data), stopped: d.stopped };
}

export function defaultSettings(startDate: string, startRatePct: number) {
  return {
    ...BOOK_DEFAULTS,
    divisions: [...BOOK_DEFAULTS.divisions],
    cadence: { ...BOOK_DEFAULTS.cadence },
    startDate,
    structureExpiryHours: {} as Record<string, number>,
    // The start-date rate skips the backdate check (`rateStartRefusal`): it is dated at the start itself (#4059 hand-off).
    rates: [{ scope: 'corp', pct: startRatePct, effectiveFrom: startDate }] as StoredRate[],
  };
}

export function parseConfirmGroupingInput(data: unknown): {
  corporationId: number;
  minerId: string;
} {
  return {
    corporationId: parseBookCall(data).corporationId,
    minerId: docId(record(data).minerId, 'minerId'),
  };
}

/** A verify link declines a pending character; `characterId` names which one. */
export function parseDeclineByTokenInput(data: unknown): { token: string; characterId: number } {
  const characterId = record(data).characterId;
  if (typeof characterId !== 'number' || !Number.isSafeInteger(characterId) || characterId <= 0)
    throw new HttpsError('invalid-argument', 'characterId must be a positive integer');
  return { token: parseToken(data), characterId };
}

export type TransferRecipient = (typeof TRANSFER_RECIPIENTS)[number];

/** One transfer from the member's wallet journal, sent as the proof of an "I already paid". */
export interface ClaimTransfer {
  amount: number;
  at: string;
  /** The member's own journal id: what an officer searches their journal on. */
  journalRef: number;
  recipient: TransferRecipient;
  /** The character or other corporation that received it. */
  recipientId?: number;
}

/** The most transfers one "I already paid" carries. */
export const CLAIM_TRANSFERS_MAX = 10;

/** A Miner's own "I paid this another way" on one of their Late notices (#6206). */
export interface DeclareOwnInput {
  corporationId: number;
  noticeId: string;
  /** What they say they paid; absent when they did not say. */
  amount?: number;
  note?: string;
  /** The transfers from their wallet journal (resolving in the app); checked before an officer sees them. */
  transfers?: ClaimTransfer[];
}

export function parseDeclareOwnInput(data: unknown): DeclareOwnInput {
  const d = record(data);
  const note = optNote(d.note);
  const transfers =
    d.transfers === undefined
      ? undefined
      : list(d.transfers, 'transfers', CLAIM_TRANSFERS_MAX).map((x) => {
          const t = record(x);
          const recipient = oneOf(t.recipient, 'recipient', TRANSFER_RECIPIENTS);
          return {
            amount: money(t.amount, 'amount'),
            at: instant(t.at, 'at'),
            journalRef: int(t.journalRef, 'journalRef'),
            recipient,
            ...(t.recipientId !== undefined
              ? { recipientId: int(t.recipientId, 'recipientId') }
              : {}),
          };
        });
  return {
    corporationId: parseBookCall(data).corporationId,
    noticeId: noticeIdOf(d),
    ...(d.amount !== undefined ? { amount: money(d.amount, 'amount') } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(transfers !== undefined ? { transfers } : {}),
  };
}

export type ClaimCheckResult = (typeof CLAIM_CHECK_RESULTS)[number];
export interface ClaimCheck {
  result: ClaimCheckResult;
  /** `found`: the book's payment it matched. */
  paymentId?: string;
  /** `division`: the wallet division it sits in, which the book does not read. */
  division?: number;
  /** `credited`: the Miner the book already credited the payment to. */
  minerId?: string;
}

/** ESI's wallet journal window: older than this before a sync, the sync could not have read it. */
const JOURNAL_WINDOW_MS = 30 * DAY_MS;

/** A payment the book holds, as `checkClaimedTransfer` reads it. */
export interface CheckablePayment {
  id: string;
  characterId?: number;
  amount: number;
  at: string;
  /** The Miner it is credited to: absent while no one has it. */
  minerId?: string;
  /** An officer marked (some of) it not tax: a payment wholly so is no one's to credit. */
  notTaxAmount?: number;
  /**
   * Held for an officer's review (#6207). The sender's own donation held because their Miner
   * seemed to owe nothing (`no-open-balance`) is still theirs to prove: the book holds the ISK.
   */
  reviewReason?: string;
}

export interface ClaimCheckContext {
  senderIds: readonly number[];
  payments: readonly CheckablePayment[];
  uncounted: readonly { characterId: number; amount: number; at: string; division: number }[];
  lastSyncAt: number | undefined;
  /** The book's first day: it holds no wallet history before it. */
  startDate?: string;
  /** Payments an earlier transfer of the same declaration matched: never matched twice. */
  taken?: Set<string>;
}

/**
 * A payment a claim may credit: no one holds it yet, and it is tax. One held for review because
 * its sender's Miner seemed to owe nothing counts (the claim is the sender's own: `same`), if paid
 * on or after the book's start: before it, it paid no mining the book bills.
 */
const creditable = (p: CheckablePayment, startDate: string | undefined) =>
  p.minerId === undefined &&
  (p.reviewReason === undefined ||
    (p.reviewReason === 'no-open-balance' &&
      (startDate === undefined || p.at.slice(0, 10) >= startDate))) &&
  (p.notTaxAmount ?? 0) < p.amount;

/**
 * Checks one claimed transfer against what the book synced of the corporation's wallet, before
 * any officer sees it (resolving in the app). One exact match (sender, amount, a payment not
 * already credited to anyone) is `found`; a donation in a division it does not read is
 * `division`; two or more candidates are `ambiguous` (an officer picks); otherwise it says why
 * it cannot say — paid after the last sync (`notSynced`), or before the wallet history the book
 * holds (`tooOld`: ESI's 30 days before the last sync, or before the book's start) — and only
 * then `notFound`. A transfer to a person or another corporation is named, not searched.
 * A `found` payment joins `ctx.taken`, so a later transfer never claims it too.
 */
export function checkClaimedTransfer(t: ClaimTransfer, ctx: ClaimCheckContext): ClaimCheck {
  if (t.recipient === 'character') return { result: 'person' };
  if (t.recipient === 'otherCorporation') return { result: 'otherCorp' };
  const at = Date.parse(t.at);
  // The claim names no sender: any of the Miner's Characters may have sent it.
  const same = (x: { characterId?: number; amount: number; at: string }) =>
    x.characterId !== undefined &&
    ctx.senderIds.includes(x.characterId) &&
    matchesStatedTransfer({ ...t, characterId: x.characterId }, x);
  const payments = ctx.payments.filter(
    (p) => same(p) && creditable(p, ctx.startDate) && !ctx.taken?.has(p.id)
  );
  const uncounted = ctx.uncounted.filter(same);
  if (payments.length + uncounted.length > 1) return { result: 'ambiguous' };
  if (payments[0]) {
    ctx.taken?.add(payments[0].id);
    return { result: 'found', paymentId: payments[0].id };
  }
  if (uncounted[0]) return { result: 'division', division: uncounted[0].division };
  // Already placed by the book: say whose, rather than that it was never seen.
  const placed = ctx.payments.find((p) => same(p) && p.minerId !== undefined);
  if (placed) return { result: 'credited', paymentId: placed.id, minerId: placed.minerId };
  if (ctx.lastSyncAt === undefined || at > ctx.lastSyncAt) return { result: 'notSynced' };
  if (at < ctx.lastSyncAt - JOURNAL_WINDOW_MS) return { result: 'tooOld' };
  if (ctx.startDate !== undefined && utcDay(at) < ctx.startDate) return { result: 'tooOld' };
  return { result: 'notFound' };
}

/** `checkClaimedTransfer` for each of a declaration's transfers, no payment matched twice. */
export function checkClaimedTransfers(
  transfers: readonly ClaimTransfer[],
  ctx: Omit<ClaimCheckContext, 'taken'>
): ClaimCheck[] {
  const taken = new Set<string>();
  return transfers.map((t) => checkClaimedTransfer(t, { ...ctx, taken }));
}

/** One ore line of a disputed Conflict day: the record, the ore, and the Payee the Miner gave it to. */
export interface DisputeLine {
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

export type DisputeKind = (typeof DISPUTE_KINDS)[number];

/** A Miner's word on a day: "I gave this ore to {payee}" (#6206), or one of the other kinds. */
export interface DisputeConflictInput {
  corporationId: number;
  date: string;
  kind: DisputeKind;
  lines: DisputeLine[];
  note?: string;
  /** Why, in the member's own words: required for every kind but `payee`. */
  reason?: string;
  /** A `rate` dispute: the rate, in percent, the member says applies. */
  claimedPct?: number;
}

/** The most ore lines one disputed day carries: a day's ore types across a Miner's characters. */
export const DISPUTE_LINES_MAX = 100;

export function parseDisputeConflictInput(data: unknown): DisputeConflictInput {
  const d = record(data);
  const date = dateString(d.date, 'date');
  // Absent on a client older than kinds: the original payee dispute.
  const kind = d.kind === undefined ? 'payee' : oneOf(d.kind, 'kind', DISPUTE_KINDS);
  const raw = list(d.lines, 'lines', DISPUTE_LINES_MAX);
  if (raw.length === 0) throw new HttpsError('invalid-argument', 'lines must not be empty');
  const lines = raw.map((x) => {
    const l = record(x);
    const key = parseRecordKey(l.recordKey);
    if (key.date !== date) throw new HttpsError('invalid-argument', 'Every line must be that day');
    return {
      recordKey: key.key,
      typeId: int(l.typeId, 'typeId'),
      quantity: int(l.quantity, 'quantity'),
      // Only a payee dispute names a Payee; the other kinds are about the book's own figures.
      payeeName:
        kind === 'payee' || l.payeeName !== undefined
          ? boundedString(l.payeeName, 'payeeName', 100)
          : '',
    };
  });
  const note = optNote(d.note);
  return {
    corporationId: parseBookCall(data).corporationId,
    date,
    kind,
    lines,
    ...(note !== undefined ? { note } : {}),
    ...(kind !== 'payee' ? { reason: reason(d.reason) } : {}),
    ...(kind === 'rate' ? { claimedPct: num(d.claimedPct, 'claimedPct', 0, 100) } : {}),
  };
}

/** A Miner withdraws their own unanswered dispute of a day. */
export interface WithdrawDisputeInput {
  corporationId: number;
  date: string;
}

export function parseWithdrawDisputeInput(data: unknown): WithdrawDisputeInput {
  const d = record(data);
  return { corporationId: parseBookCall(data).corporationId, date: dateString(d.date, 'date') };
}

/** The ore a book recorded, as the server's Observed Rows hold it. */
export interface RecordedOre {
  characterId: number;
  structureId: number;
  date: string;
  typeId: number;
  quantity: number;
}

const lineId = (l: DisputeLine) => JSON.stringify([l.recordKey, l.typeId, l.quantity, l.payeeName]);

/**
 * A dispute's lines after one more call (#6206): `incoming` added to what the day already holds,
 * an exact repeat dropped (as `arrayUnion` would). Every record and ore must be one the book
 * recorded, the disputed quantity of each across all its Payees no more than recorded, and the
 * day at most `DISPUTE_LINES_MAX` lines however many calls built it.
 */
export function mergeDisputeLines(
  held: readonly DisputeLine[],
  incoming: readonly DisputeLine[],
  recorded: readonly RecordedOre[]
): DisputeLine[] {
  const merged = new Map(held.map((l) => [lineId(l), l]));
  for (const l of incoming) merged.set(lineId(l), l);
  const lines = [...merged.values()];
  if (lines.length > DISPUTE_LINES_MAX)
    throw new HttpsError('invalid-argument', 'Too many lines for one day', {
      reason: 'too-many-lines',
    });
  const onRecord = new Map<string, number>();
  for (const r of recorded) {
    const key = `${r.characterId}:${r.structureId}:${r.date}|${r.typeId}`;
    onRecord.set(key, (onRecord.get(key) ?? 0) + r.quantity);
  }
  const disputed = new Map<string, number>();
  for (const l of lines) {
    const key = `${l.recordKey}|${l.typeId}`;
    disputed.set(key, (disputed.get(key) ?? 0) + l.quantity);
  }
  for (const [key, quantity] of disputed) {
    if (quantity > (onRecord.get(key) ?? 0))
      throw new HttpsError('invalid-argument', 'That ore is not on the record', {
        reason: 'not-on-record',
      });
  }
  return lines;
}

/** An ore line a Late notice listed, as it was priced (`LateNoticeLine`). */
interface BilledLine {
  oreLines: { typeId: number; quantity: number }[];
  unitPrices: Record<string, number>;
  taxPct: number;
}

function billedLineOf(raw: unknown): (BilledLine & { key: string }) | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (l.kind !== 'mined' && l.kind !== 'late-ore') return null;
  if (typeof l.key !== 'string' || typeof l.taxPct !== 'number') return null;
  if (!Array.isArray(l.oreLines) || typeof l.unitPrices !== 'object' || l.unitPrices === null)
    return null;
  const oreLines = (l.oreLines as unknown[]).flatMap((o) => {
    const x = o as { typeId?: unknown; quantity?: unknown } | null;
    return x && typeof x.typeId === 'number' && typeof x.quantity === 'number'
      ? [{ typeId: x.typeId, quantity: x.quantity }]
      : [];
  });
  return {
    key: l.key,
    oreLines,
    unitPrices: l.unitPrices as Record<string, number>,
    taxPct: l.taxPct,
  };
}

/**
 * The tax a waived dispute credits, priced on the server from the book's own records: each
 * disputed ore at the unit price and rate the Late notices listed it at, never more of it than
 * they listed (a late-ore line adds its growth). Undefined when a disputed record is on no notice
 * yet: the server holds no price for a day not listed, so it is never waived at the client's word
 * under the Director limit.
 */
export function billedDisputeTax(
  dispute: {
    lines: readonly Pick<DisputeLine, 'recordKey' | 'typeId' | 'quantity'>[];
    kind?: DisputeKind;
    claimedPct?: number;
  },
  notices: readonly { lines?: unknown }[]
): number | undefined {
  const billed = new Map<string, BilledLine[]>();
  for (const s of notices) {
    if (!Array.isArray(s.lines)) continue;
    for (const raw of s.lines) {
      const line = billedLineOf(raw);
      if (line) billed.set(line.key, [...(billed.get(line.key) ?? []), line]);
    }
  }
  const disputed = new Map<string, number>();
  for (const l of dispute.lines) {
    const key = `${l.recordKey}|${l.typeId}`;
    disputed.set(key, (disputed.get(key) ?? 0) + l.quantity);
  }
  let tax = 0;
  for (const [key, quantity] of disputed) {
    const [recordKey, type] = key.split('|');
    const typeId = Number(type);
    const lines = billed.get(recordKey);
    if (!lines) return undefined;
    let left = quantity;
    for (const line of lines) {
      const held = line.oreLines.reduce((n, o) => (o.typeId === typeId ? n + o.quantity : n), 0);
      const take = Math.min(left, held);
      if (take <= 0) continue;
      const price = line.unitPrices[String(typeId)];
      if (typeof price !== 'number') return undefined;
      // A rate dispute is about the rate, not the ore: waiving it credits only the gap.
      const pct =
        dispute.kind === 'rate' && dispute.claimedPct !== undefined
          ? Math.max(0, line.taxPct - dispute.claimedPct)
          : line.taxPct;
      tax += take * price * (pct / 100);
      left -= take;
    }
  }
  return tax;
}

/**
 * The ids of a Miner's open disputes an officer write-off closes (#6307). A write-off forgives
 * the oldest unpaid days first (decision 20261120-235011), read off the Miner's account as it
 * stands now (`liveRunningAccount`): the open disputes of the days it forgives in full close, a held day
 * included, while a day only partly forgiven keeps its dispute; a write-off of the whole balance
 * closes every one. With the account's days unknown, none closes.
 */
export function disputesClosedByWriteOff(
  disputes: readonly { id?: unknown; date?: unknown; resolution?: unknown }[],
  writeOff: { amount: number },
  live?: { owed: number; unpaidDays?: readonly Pick<OwedDay, 'date' | 'owed'>[] }
): string[] {
  if (!live?.unpaidDays) return [];
  const open = disputes.filter((d) => typeof d.id === 'string' && !d.resolution);
  if (writeOff.amount >= live.owed - 0.01) return open.map((d) => d.id as string);
  const forgiven = new Set(payOldestFirst(live.unpaidDays, writeOff.amount, 0.01).paid);
  return open
    .filter((d) => typeof d.date === 'string' && forgiven.has(d.date))
    .map((d) => d.id as string);
}

/**
 * What a hand-recorded payment is, among the transfers the book already knows of from the same
 * sender (`matchesStatedTransfer`): a donation it holds (`held`: assign that one instead, never
 * count it twice), one noted in a division the book does not read (`uncounted`: the hand record
 * stands for it, so the donation is not stored again if that division is later read), or neither.
 * The nearest in time wins.
 */
export function handRecordMatch(
  stated: { characterId: number; amount: number; at: string },
  known: {
    held: readonly { id: string; characterId?: number; amount: number; at: string }[];
    uncounted: readonly { id: string; characterId: number; amount: number; at: string }[];
  }
): { kind: 'held' | 'uncounted'; id: string } | null {
  const gap = (x: { at: string }) => Math.abs(Date.parse(x.at) - Date.parse(stated.at));
  const candidates = [
    ...known.held.map((x) => ({ kind: 'held' as const, x })),
    ...known.uncounted.map((x) => ({ kind: 'uncounted' as const, x })),
  ]
    .filter(({ x }) => matchesStatedTransfer(stated, x))
    .sort((a, b) => gap(a.x) - gap(b.x));
  const best = candidates[0];
  return best ? { kind: best.kind, id: best.x.id } : null;
}

/** One dispute per Miner and day: `solo:7` has a colon, which a doc id avoids. */
export function disputeIdFor(minerId: string, date: string): string {
  return `${minerId.replace(/[^A-Za-z0-9_-]/g, '_')}_${date}`;
}

/** An officer dismisses a Character's answer to a grouping from Needs you. */
export function parseGroupingAnswerInput(data: unknown): BookCall & { characterId: number } {
  return {
    ...parseBookCall(data),
    characterId: int(record(data).characterId, 'characterId', 1, Number.MAX_SAFE_INTEGER),
  };
}

/** A player claims one of their own Unmatched donations (D5). */
export function parseClaimPaymentInput(data: unknown): {
  corporationId: number;
  paymentId: string;
  /** The player says their own donation held for review was tax (`claimPayment`). */
  inReview?: true;
} {
  return {
    corporationId: parseBookCall(data).corporationId,
    paymentId: docId(record(data).paymentId, 'paymentId'),
    ...(record(data).inReview === true ? { inReview: true as const } : {}),
  };
}
