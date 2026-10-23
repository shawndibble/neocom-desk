// Corp Tax Book (issue #4061, epic #4055, ADR 0023): the pure half of the
// callables — layout constants, role decisions and input parsing — with no
// Firestore, so it is unit testable. The admin-SDK half is corpTaxBookStore.ts
// and the wiring is in index.ts.
//
// Firestore layout (rules in firestore.rules; every write is a callable):
//   corps/{corporationId}                settings: start date, hub, Ore Form, rates, grace,
//                                               minimum Statement, divisions, lastSync
//     officers/{uid}                            officer access record (24h) written by verifyOfficer
//     observed/{char_type_date_structure}       Observed Mining Entry rows, upserted monotonically
//     extractions/{structure_start}             Extractions, kept after ESI stops listing them
//     payments/{id}                             Tax Payments (donations found in the journal, manual)
//     dismissals/{id}  declarations/{id}  adjustments/{id}  writeOffs/{id}  rebills/{id}
//     statements/{id}                           issued Statements, create-only (forward-only)
//     miners/{minerId}                          Miner groupings
//     meta/paid                                 paidStatementIds, only ever grown (D22)
//     audit/{at~rand}                           immutable audit log
//   corpTaxBookTokens/{token}                   verify-link tokens; no client access at all

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, docId, record } from './communities.js';
import { BOOK_DEFAULTS, type ForfeitBasis } from './corpTaxBookEngine.js';

/** The Tax Book lives under the `corps/{id}` umbrella (issue #4858, ADR 0026). */
export const BOOKS_COLLECTION = 'corps';
export const TOKENS_COLLECTION = 'corpTaxBookTokens';

/**
 * How long a freshly turned-on book stays out of the members' own Mining Tax
 * page (no balances, donation notes or notices), so the officers can set the
 * rates, the sync and the payment matching up before anyone is told anything.
 */
export const MEMBER_SETUP_MS = 72 * 60 * 60 * 1000;
export const OFFICERS = 'officers';
export const OBSERVED = 'observed';
export const EXTRACTIONS = 'extractions';
export const PAYMENTS = 'payments';
export const DISMISSALS = 'dismissals';
export const DECLARATIONS = 'declarations';
export const ADJUSTMENTS = 'adjustments';
export const WRITE_OFFS = 'writeOffs';
export const REBILLS = 'rebills';
export const STATEMENTS = 'statements';
/** `statementLinks/{statementId}`: the verify token, readable by editors only. */
export const STATEMENT_LINKS = 'statementLinks';
export const MINERS = 'miners';
export const META = 'meta';
export const PAID_DOC = 'paid';
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
export const ROLE_CACHE_MS = 10 * 60_000;
/** Read access lapses this long after the last check (D7). */
export const ACCESS_TTL_MS = 24 * 3_600_000;

export const MAX_SYNC_OBSERVED = 2000;
export const MAX_SYNC_EXTRACTIONS = 200;
export const MAX_SYNC_DONATIONS = 500;
export const MAX_RATES = 500;
export const MAX_STATEMENT_JSON = 900_000;

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
  return now - checkedAt <= ROLE_CACHE_MS && checkedAt <= now + 60_000;
}

// --- Input parsing --------------------------------------------------------

export function utcDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

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

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpsError('invalid-argument', `${field} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
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
  | { scope: 'feeder'; feederId: number; pct: number; effectiveFrom: string }
  | { scope: 'record'; recordKey: string; pct: number };

export function parseDatedRate(data: unknown): Exclude<StoredRate, { scope: 'record' }> {
  const d = record(data);
  const scope = oneOf(d.scope, 'scope', [
    'corp',
    'guest',
    'miner',
    'moon',
    'structure',
    'feeder',
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
  if (scope === 'feeder') return { scope, feederId: int(d.feederId, 'feederId'), ...base };
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
  minimumStatement?: number;
  overdueDays?: number;
  divisions?: number[];
  cadence?: { kind: 'monthly' } | { kind: 'days'; days: number; anchor: string };
  chunkM3PerHour?: number;
  structureExpiryHours?: Record<string, number>;
  dismissApprovalAboveIsk?: number | null;
}

const HUBS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;

export function parseSettingsPatch(data: unknown): SettingsPatch {
  const d = record(data);
  const patch: SettingsPatch = {};
  if (d.hubId !== undefined) patch.hubId = oneOf(d.hubId, 'hubId', HUBS);
  if (d.oreForm !== undefined)
    patch.oreForm = oneOf(d.oreForm, 'oreForm', ['compressed', 'raw'] as const);
  if (d.graceHours !== undefined) patch.graceHours = num(d.graceHours, 'graceHours', 0, 72);
  if (d.minimumStatement !== undefined) {
    patch.minimumStatement = num(d.minimumStatement, 'minimumStatement', 0, 1e12);
  }
  if (d.overdueDays !== undefined) patch.overdueDays = int(d.overdueDays, 'overdueDays', 1, 365);
  if (d.divisions !== undefined) {
    const divisions = list(d.divisions, 'divisions', 7).map((x) => int(x, 'division', 1, 7));
    if (divisions.length === 0)
      throw new HttpsError('invalid-argument', 'divisions cannot be empty');
    patch.divisions = [...new Set(divisions)].sort();
  }
  if (d.cadence !== undefined) {
    const c = record(d.cadence);
    patch.cadence =
      oneOf(c.kind, 'cadence.kind', ['monthly', 'days'] as const) === 'monthly'
        ? { kind: 'monthly' }
        : {
            kind: 'days',
            days: int(c.days, 'cadence.days', 1, 366),
            anchor: dateString(c.anchor, 'cadence.anchor'),
          };
  }
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
  if (Object.keys(patch).length === 0)
    throw new HttpsError('invalid-argument', 'no settings given');
  return patch;
}

export type EditAction =
  | { action: 'addRate'; rate: ReturnType<typeof parseDatedRate> }
  | { action: 'setRecordRate'; recordKey: string; pct: number; reason: string }
  | { action: 'updateSettings'; patch: SettingsPatch }
  | {
      action: 'recordPayment';
      paymentId: string;
      minerId: string;
      characterId: number;
      amount: number;
      at: string;
      statementId?: string;
      note?: string;
    }
  | { action: 'markNotTax'; paymentId: string; notTaxAmount: number; reason: string }
  | { action: 'assignPayment'; paymentId: string; minerId: string }
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
  /** Links a Moon Ore Survey (a Share Link id) as a chunk's ore source, or unlinks it with null (D13). */
  | { action: 'linkSurvey'; extractionId: string; surveyId: string | null }
  | { action: 'setMiner'; minerId: string; characterIds: number[]; mainCharacterId: number }
  | { action: 'unlink'; minerId: string; characterId: number }
  | {
      /** Folds stored Miners into one, atomically (#4194): the "Group with…" dialog's single call. */
      action: 'regroupMiner';
      minerId: string;
      characterIds: number[];
      mainCharacterId: number;
      absorbMinerIds: string[];
    }
  | { action: 'addAdjustment'; minerId: string; date: string; amount: number; reason: string }
  | { action: 'writeOff'; minerId: string; statementId?: string; amount: number; reason: string }
  | { action: 'rebill'; minerId: string; fromDate: string; reason: string }
  | {
      action: 'closeAccount';
      minerId: string;
      reason: string;
      /** The final Statement, issued in the same write. Absent when nothing is left to bill. */
      statement?: Record<string, unknown>;
      /** Credit is refunded unless the guest consented or went 90 days without replying. */
      credit: CloseCredit;
    }
  | { action: 'issueStatement'; statement: Record<string, unknown> }
  | { action: 'settleStatements'; statementIds: string[] }
  | {
      action: 'declare';
      statementId: string;
      kind: 'contract' | 'other-division' | 'wrong-corp';
      note?: string;
    }
  | {
      action: 'resolveDeclaration';
      declarationId: string;
      resolution: 'confirmed' | 'rejected';
      reason?: string;
    }
  | { action: 'recordReminder'; statementId: string }
  | {
      action: 'recordMail';
      statementId: string;
      mailId: number;
      kind: 'statement' | 'reminder';
    };

export type CloseCredit = { kind: 'refund' } | { kind: 'forfeit'; basis: ForfeitBasis };

/** Dismissals, write-offs, rebills and "not tax" re-check the role live (D7). */
export const LIVE_CHECK_ACTIONS: ReadonlySet<EditAction['action']> = new Set([
  'dismiss',
  'dismissRecords',
  'reverseDismissal',
  'writeOff',
  'rebill',
  'markNotTax',
]);

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
 * day by day. An omitted amount counts as over the limit.
 */
export function dismissalNeedsDirector(
  limit: number | null | undefined,
  amounts: readonly (number | undefined)[],
  isDirector: boolean
): boolean {
  if (isDirector || typeof limit !== 'number') return false;
  const total = amounts.reduce<number>((sum, a) => sum + (a ?? Infinity), 0);
  return total > limit;
}

const reason = (v: unknown) => boundedString(v, 'reason', 500);
const optNote = (v: unknown) => (v === undefined ? undefined : boundedString(v, 'note', 500));
const optId = (v: unknown, f: string) => (v === undefined ? undefined : docId(v, f));
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
    'setRecordRate',
    'updateSettings',
    'recordPayment',
    'markNotTax',
    'assignPayment',
    'dismiss',
    'dismissRecords',
    'reverseDismissal',
    'linkSurvey',
    'setMiner',
    'unlink',
    'regroupMiner',
    'addAdjustment',
    'writeOff',
    'rebill',
    'closeAccount',
    'issueStatement',
    'settleStatements',
    'declare',
    'resolveDeclaration',
    'recordReminder',
    'recordMail',
  ] as const);
  switch (action) {
    case 'addRate':
      return { action, rate: parseDatedRate(d.rate) };
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
        statementId: optId(d.statementId, 'statementId'),
        note: optNote(d.note),
      };
    case 'markNotTax':
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        notTaxAmount: num(d.notTaxAmount, 'notTaxAmount', 0, 1e13),
        reason: reason(d.reason),
      };
    case 'assignPayment':
      return {
        action,
        paymentId: docId(d.paymentId, 'paymentId'),
        minerId: docId(d.minerId, 'minerId'),
      };
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
    case 'linkSurvey':
      return {
        action,
        extractionId: docId(d.extractionId, 'extractionId'),
        surveyId: d.surveyId === null ? null : docId(d.surveyId, 'surveyId'),
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
      };
    case 'addAdjustment':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        date: dateString(d.date, 'date'),
        amount: num(d.amount, 'amount', -1e13, 1e13),
        reason: reason(d.reason),
      };
    case 'writeOff':
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        statementId: optId(d.statementId, 'statementId'),
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
    case 'issueStatement': {
      const statement = record(d.statement);
      if (JSON.stringify(statement).length > MAX_STATEMENT_JSON) {
        throw new HttpsError('invalid-argument', 'statement is too large');
      }
      return { action, statement };
    }
    case 'closeAccount': {
      const statement = d.statement === undefined ? undefined : record(d.statement);
      if (statement && JSON.stringify(statement).length > MAX_STATEMENT_JSON) {
        throw new HttpsError('invalid-argument', 'statement is too large');
      }
      return {
        action,
        minerId: docId(d.minerId, 'minerId'),
        reason: reason(d.reason),
        ...(statement ? { statement } : {}),
        credit: parseCloseCredit(d.credit),
      };
    }
    case 'settleStatements':
      return {
        action,
        statementIds: list(d.statementIds, 'statementIds', 200).map((x) => docId(x, 'statementId')),
      };
    case 'declare':
      return {
        action,
        statementId: docId(d.statementId, 'statementId'),
        kind: oneOf(d.kind, 'kind', ['contract', 'other-division', 'wrong-corp'] as const),
        note: optNote(d.note),
      };
    case 'resolveDeclaration': {
      const resolution = oneOf(d.resolution, 'resolution', ['confirmed', 'rejected'] as const);
      return {
        action,
        declarationId: docId(d.declarationId, 'declarationId'),
        resolution,
        reason: resolution === 'rejected' ? reason(d.reason) : optNote(d.reason),
      };
    }
    case 'recordReminder':
      return { action, statementId: docId(d.statementId, 'statementId') };
    case 'recordMail':
      return {
        action,
        statementId: docId(d.statementId, 'statementId'),
        mailId: int(d.mailId, 'mailId', 1, Number.MAX_SAFE_INTEGER),
        kind: oneOf(d.kind, 'kind', ['statement', 'reminder'] as const),
      };
  }
}

/** The Statement fields the book relies on; the rest of the engine's shape is stored as given. */
export interface StoredStatement {
  id: string;
  minerId: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  coversFrom: string;
  coversThrough: string;
  issuedAt: string;
  hubId: string;
  oreForm: string;
  lines: { kind: string; date: string; characterId?: number }[];
  amount: number;
  /** Characters of the Miner, for the own-lines rule. */
  characterIds: number[];
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

export function parseStatement(raw: Record<string, unknown>): StoredStatement {
  const lines = list(raw.lines, 'statement.lines', 5000).map((l) => {
    const line = record(l);
    return {
      ...line,
      kind: oneOf(line.kind, 'line.kind', ['mined', 'late-ore', 'correction'] as const),
      date: dateString(line.date, 'line.date'),
    } as StoredStatement['lines'][number];
  });
  return {
    ...(raw as object),
    id: docId(raw.id, 'statement.id'),
    minerId: docId(raw.minerId, 'statement.minerId'),
    code: boundedString(raw.code, 'statement.code', 64),
    periodStart: dateString(raw.periodStart, 'periodStart'),
    periodEnd: dateString(raw.periodEnd, 'periodEnd'),
    coversFrom: dateString(raw.coversFrom, 'coversFrom'),
    coversThrough: dateString(raw.coversThrough, 'coversThrough'),
    issuedAt: instant(raw.issuedAt, 'issuedAt'),
    hubId: oneOf(raw.hubId, 'hubId', HUBS),
    oreForm: oneOf(raw.oreForm, 'oreForm', ['compressed', 'raw'] as const),
    lines,
    amount: num(raw.amount, 'statement.amount', 0, 1e13),
    characterIds: list(raw.characterIds, 'statement.characterIds', 50).map((x) =>
      int(x, 'characterId')
    ),
    ...displayNames(raw),
  } as StoredStatement;
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
    minerId?: string;
    statementId?: string;
  }[];
  gaps: { structureId: number; from: string; to: string }[];
}

export function parseSyncInput(data: unknown, nowMs: number): SyncInput {
  const d = record(data);
  const today = utcDate(nowMs);
  const observed = list(d.observed ?? [], 'observed', MAX_SYNC_OBSERVED).map((r) => {
    const row = record(r);
    const date = dateString(row.date, 'date');
    const cachedAt = instant(row.cachedAt, 'cachedAt');
    if (date > today || Date.parse(cachedAt) > nowMs + 3_600_000) {
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
      minerId: optId(x.minerId, 'minerId'),
      statementId: optId(x.statementId, 'statementId'),
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
  return { ...parseBookCall(data), observed, extractions, donations, gaps };
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
    // The start-date rate is not retroactive-checked: it is dated at the start itself (#4059 hand-off).
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

/** A player claims one of their own Unmatched donations (D5). */
export function parseClaimPaymentInput(data: unknown): {
  corporationId: number;
  paymentId: string;
} {
  return {
    corporationId: parseBookCall(data).corporationId,
    paymentId: docId(record(data).paymentId, 'paymentId'),
  };
}
