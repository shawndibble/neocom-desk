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

export const BOOKS_COLLECTION = 'corps';
export { TOKENS_COLLECTION } from './corpTaxBookVersionKeys.js';

export const MEMBER_SETUP_MS = 72 * 60 * 60 * 1000;
export const OFFICERS = 'officers';
export const PAID_DOC = 'paid';
export const SCHEDULED_SYNC_DOC = 'scheduledSync';
export const UNCOUNTED_DOC = 'uncounted';
export const UNCOUNTED_IGNORED_MAX = 200;
export const AUDIT = 'audit';
export const FEEDERS = 'feeders';
export const FEEDER_INVITES_COLLECTION = 'corpTaxBookFeederInvites';
export const FEEDER_OF_COLLECTION = 'corpTaxBookFeederOf';
export const FEEDER_PREVIOUS_COLLECTION = 'corpTaxBookFeederPrevious';
export const REMOVAL_LINKS_COLLECTION = 'corpTaxBookRemovalLinks';
export const FEEDER_VIEWS = 'feederViews';
export const BILLED_BY_COLLECTION = 'corpTaxBookBilledBy';

export const ROLE_CACHE_MS = 10 * MINUTE_MS;
export const ACCESS_TTL_MS = DAY_MS;

export const MAX_SYNC_OBSERVED = 2000;
export const MAX_SYNC_EXTRACTIONS = 200;
export const MAX_SYNC_DONATIONS = 500;
export const MAX_RATES = 500;
export const MAX_NOTICE_JSON = 900_000;

const VIEW_ROLES = ['Director', 'Accountant', 'Junior_Accountant'];
const EDIT_ROLES = ['Director', 'Accountant'];

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

export interface OfficerAccess extends OfficerRoles {
  characterId: number;
  characterName: string;
  ownerHash: string;
  corporationId: number;
  roles: string[];
  checkedAt: number;
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

export interface BookCall {
  corporationId: number;
  accessToken?: string;
}

export function parseBookCall(data: unknown): BookCall {
  const d = record(data);
  const accessToken =
    d.accessToken === undefined ? undefined : boundedString(d.accessToken, 'accessToken', 8192);
  return { corporationId: int(d.corporationId, 'corporationId', 1, CORP_ID_MAX), accessToken };
}

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
  if (scope === 'structure')
    return { scope, structureId: int(d.structureId, 'structureId'), ...base };
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
  divisionsBase?: number[];
  primaryDivision?: number;
  addDivision?: number;
  divisionNames?: Record<string, string>;
  chunkM3PerHour?: number;
  structureExpiryHours?: Record<string, number>;
  dismissApprovalAboveIsk?: number | null;
  taxContact?: TaxContact | null;
  startDate?: string;
  showToMembers?: true;
  noticeRules?: NoticeRules;
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

function parseDivisions(value: unknown, field: string): number[] {
  const divisions = list(value, field, 7).map((x) => int(x, 'division', 1, 7));
  return [...new Set(divisions)].sort((a, b) => a - b);
}

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
      declarationId?: string;
    }
  | { action: 'markNotTax'; paymentId: string; notTaxAmount: number; reason?: string }
  | {
      action: 'assignPayment';
      paymentId: string;
      minerId: string;
      declarationId?: string;
    }
  | { action: 'reassignPayment'; paymentId: string; minerId: string | null }
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
      targets: { targetId: string; amountIsk: number }[];
      reason: string;
    }
  | { action: 'reverseDismissal'; dismissalId: string; reason: string }
  | {
      action: 'linkSurvey';
      extractionId: string;
      surveyId: string | null;
      surveyScan?: SurveyScanSnapshot;
    }
  | { action: 'setFullyMined'; extractionId: string; fullyMined: boolean }
  | { action: 'setMiner'; minerId: string; characterIds: number[]; mainCharacterId: number }
  | {
      action: 'unlink';
      minerId: string;
      characterId: number;
      leftOn?: string;
    }
  | {
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
      kind?: 'opening';
    }
  | { action: 'reverseAdjustment'; adjustmentId: string; reason: string }
  | {
      action: 'editAdjustment';
      adjustmentId: string;
      date: string;
      amount: number;
      reason: string;
    }
  | { action: 'reverseWriteOff'; writeOffId: string; reason: string }
  | {
      action: 'setToleranceExemption';
      minerId: string;
      date: string;
      forgive: number;
      reason: string;
    }
  | { action: 'writeOff'; minerId: string; amount: number; reason: string }
  | { action: 'rebill'; minerId: string; fromDate: string; reason: string }
  | {
      action: 'closeAccount';
      minerId: string;
      reason: string;
      notice?: LateNotice;
      credit: CloseCredit;
      runningCredit?: number;
    }
  | { action: 'issueLateNotice'; notice: LateNotice }
  | {
      action: 'declare';
      noticeId: string;
      kind: 'contract' | 'other-division' | 'wrong-corp';
      note?: string;
    }
  | { action: 'rejectDispute'; disputeId: string; reason: string; nextStep?: string }
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
      nextStep?: string;
    }
  | { action: 'recordReminder'; noticeId: string }
  | { action: 'setPopSharing'; enabled?: boolean; defaults?: Partial<PopSharingSettings> }
  | { action: 'setPopSharingMoon'; moonId: number; override: PopSharingOverridePatch }
  | { action: 'recordLateNoticeMail'; noticeId: string; mailId: number; kind: LateNoticeMailKind }
  | { action: 'recordAccounts'; accounts: RecordedRunningAccount[] };

export type LateNoticeMailKind = 'notice' | 'reminder';

export type RecordedCheckpoint = Omit<RunningAccountCheckpoint, 'at' | 'by'>;

export interface RecordedRunningAccount {
  minerId: string;
  owed: number;
  paid: number;
  days: number;
  oldest?: string;
  paidThrough?: string;
  unpaidDays?: OwedDay[];
  settledThrough?: string;
  credit?: number;
  snapshot?: RecordedCheckpoint;
}

export type CloseCredit = { kind: 'refund' } | { kind: 'forfeit'; basis: ForfeitBasis };

export const LIVE_CHECK_ACTIONS: ReadonlySet<EditAction['action']> = new Set(
  LIVE_CHECK_ACTION_NAMES satisfies readonly EditAction['action'][]
);

export function needsLiveCheck(action: EditAction): boolean {
  return (
    LIVE_CHECK_ACTIONS.has(action.action) ||
    (action.action === 'closeAccount' && action.credit.kind === 'forfeit')
  );
}

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
const optReason = (v: unknown) =>
  v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : reason(v);
const optNote = (v: unknown) =>
  v === undefined ? undefined : boundedString(v, 'note', PAYMENT_NOTE_MAX);
const optNextStep = (v: unknown) =>
  v === undefined ? undefined : boundedString(v, 'nextStep', 500);
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

export type CheckpointRefusal =
  'wrong-date' | 'exists' | CheckpointProblem | 'unknown-miner' | 'characters-changed';

export function checkpointRefusal(
  k: RecordedCheckpoint,
  ctx: {
    stored?: Pick<RunningAccountCheckpoint, 'through' | 'at' | 'characterIds'>;
    today: string;
    known: boolean;
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
    reviewReason?: 'no-open-balance';
  }[];
  gaps: { structureId: number; from: string; to: string }[];
  uncounted?: UncountedDonation[];
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

export function parseDeclineByTokenInput(data: unknown): { token: string; characterId: number } {
  const characterId = record(data).characterId;
  if (typeof characterId !== 'number' || !Number.isSafeInteger(characterId) || characterId <= 0)
    throw new HttpsError('invalid-argument', 'characterId must be a positive integer');
  return { token: parseToken(data), characterId };
}

export type TransferRecipient = (typeof TRANSFER_RECIPIENTS)[number];

export interface ClaimTransfer {
  amount: number;
  at: string;
  journalRef: number;
  recipient: TransferRecipient;
  recipientId?: number;
}

export const CLAIM_TRANSFERS_MAX = 10;

export interface DeclareOwnInput {
  corporationId: number;
  noticeId: string;
  amount?: number;
  note?: string;
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
  paymentId?: string;
  division?: number;
  minerId?: string;
}

const JOURNAL_WINDOW_MS = 30 * DAY_MS;

export interface CheckablePayment {
  id: string;
  characterId?: number;
  amount: number;
  at: string;
  minerId?: string;
  notTaxAmount?: number;
  reviewReason?: string;
}

export interface ClaimCheckContext {
  senderIds: readonly number[];
  payments: readonly CheckablePayment[];
  uncounted: readonly { characterId: number; amount: number; at: string; division: number }[];
  lastSyncAt: number | undefined;
  startDate?: string;
  taken?: Set<string>;
}

const creditable = (p: CheckablePayment, startDate: string | undefined) =>
  p.minerId === undefined &&
  (p.reviewReason === undefined ||
    (p.reviewReason === 'no-open-balance' &&
      (startDate === undefined || p.at.slice(0, 10) >= startDate))) &&
  (p.notTaxAmount ?? 0) < p.amount;

export function checkClaimedTransfer(t: ClaimTransfer, ctx: ClaimCheckContext): ClaimCheck {
  if (t.recipient === 'character') return { result: 'person' };
  if (t.recipient === 'otherCorporation') return { result: 'otherCorp' };
  const at = Date.parse(t.at);
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
  const placed = ctx.payments.find((p) => same(p) && p.minerId !== undefined);
  if (placed) return { result: 'credited', paymentId: placed.id, minerId: placed.minerId };
  if (ctx.lastSyncAt === undefined || at > ctx.lastSyncAt) return { result: 'notSynced' };
  if (at < ctx.lastSyncAt - JOURNAL_WINDOW_MS) return { result: 'tooOld' };
  if (ctx.startDate !== undefined && utcDay(at) < ctx.startDate) return { result: 'tooOld' };
  return { result: 'notFound' };
}

export function checkClaimedTransfers(
  transfers: readonly ClaimTransfer[],
  ctx: Omit<ClaimCheckContext, 'taken'>
): ClaimCheck[] {
  const taken = new Set<string>();
  return transfers.map((t) => checkClaimedTransfer(t, { ...ctx, taken }));
}

export interface DisputeLine {
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

export type DisputeKind = (typeof DISPUTE_KINDS)[number];

export interface DisputeConflictInput {
  corporationId: number;
  date: string;
  kind: DisputeKind;
  lines: DisputeLine[];
  note?: string;
  reason?: string;
  claimedPct?: number;
}

export const DISPUTE_LINES_MAX = 100;

export function parseDisputeConflictInput(data: unknown): DisputeConflictInput {
  const d = record(data);
  const date = dateString(d.date, 'date');
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

export interface WithdrawDisputeInput {
  corporationId: number;
  date: string;
}

export function parseWithdrawDisputeInput(data: unknown): WithdrawDisputeInput {
  const d = record(data);
  return { corporationId: parseBookCall(data).corporationId, date: dateString(d.date, 'date') };
}

export interface RecordedOre {
  characterId: number;
  structureId: number;
  date: string;
  typeId: number;
  quantity: number;
}

const lineId = (l: DisputeLine) => JSON.stringify([l.recordKey, l.typeId, l.quantity, l.payeeName]);

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

export function disputeIdFor(minerId: string, date: string): string {
  return `${minerId.replace(/[^A-Za-z0-9_-]/g, '_')}_${date}`;
}

export function parseGroupingAnswerInput(data: unknown): BookCall & { characterId: number } {
  return {
    ...parseBookCall(data),
    characterId: int(record(data).characterId, 'characterId', 1, Number.MAX_SAFE_INTEGER),
  };
}

export function parseClaimPaymentInput(data: unknown): {
  corporationId: number;
  paymentId: string;
  inReview?: true;
} {
  return {
    corporationId: parseBookCall(data).corporationId,
    paymentId: docId(record(data).paymentId, 'paymentId'),
    ...(record(data).inReview === true ? { inReview: true as const } : {}),
  };
}
