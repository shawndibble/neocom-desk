import { isPlainRecord } from './guards.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';
import { PAYOUT_LINK_WINDOW_DAYS } from './corpTaxBookTransferMatch.js';

export interface ObservedRow {
  structureId: number;
  characterId: number;
  recordedCorporationId: number;
  typeId: number;
  date: string;
  quantity: number;
  cachedAt: string;
  solarSystemId?: number;
  moonId?: number;
  extractionId?: string;
  sourceCorporationId?: number;
}

export function observedRowKey(row: ObservedRow): string {
  return `${row.characterId}:${row.typeId}:${row.date}:${row.structureId}`;
}

export interface ObservedMerge {
  rows: ObservedRow[];
  changed: ObservedRow[];
}

export function mergeObservedRows(
  existing: readonly ObservedRow[],
  fresh: readonly ObservedRow[]
): ObservedMerge {
  const byKey = new Map(existing.map((row) => [observedRowKey(row), row]));
  const changed: ObservedRow[] = [];
  for (const row of fresh) {
    const key = observedRowKey(row);
    const held = byKey.get(key);
    if (held) {
      if (Date.parse(row.cachedAt) < Date.parse(held.cachedAt)) continue;
      if (row.quantity <= held.quantity) continue;
    }
    byKey.set(key, row);
    changed.push(row);
  }
  return { rows: [...byKey.values()], changed };
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface CorpRecord {
  characterId: number;
  date: string;
  cachedAt?: string;
  structureId?: number;
  recordedCorporationId: number;
}

const readMs = (cachedAt: string | undefined) => {
  const ms = cachedAt === undefined ? Number.NaN : Date.parse(cachedAt);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

function recordedLater(a: CorpRecord, b: CorpRecord): boolean {
  if (a.date !== b.date) return a.date > b.date;
  const read = readMs(a.cachedAt) - readMs(b.cachedAt);
  if (read !== 0 && !Number.isNaN(read)) return read > 0;
  const structure = (a.structureId ?? 0) - (b.structureId ?? 0);
  if (structure !== 0) return structure > 0;
  return a.recordedCorporationId > b.recordedCorporationId;
}

export function latestRecordedCorp(
  rows: readonly CorpRecord[]
): Map<number, { date: string; corp: number }> {
  const best = new Map<number, CorpRecord>();
  for (const row of rows) {
    const held = best.get(row.characterId);
    if (!held || recordedLater(row, held)) best.set(row.characterId, row);
  }
  return new Map(
    [...best].map(([id, row]) => [id, { date: row.date, corp: row.recordedCorporationId }])
  );
}

export const MAX_RATE_BACKDATE_DAYS = 30;

export function rateStartRefusal(
  effectiveFrom: string,
  today: string,
  lastNoticed: string | null
): 'too-old' | 'on-statement' | null {
  if (effectiveFrom < shiftDate(today, -MAX_RATE_BACKDATE_DAYS)) return 'too-old';
  if (lastNoticed !== null && effectiveFrom <= lastNoticed) return 'on-statement';
  return null;
}

export const BOOK_DEFAULTS = {
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 0.5,
  minimumStatement: 5_000_000,
  overdueDays: 14,
  divisions: [1],
  cadence: { kind: 'monthly' },
} as const;

export const DIVISION_NAME_MAX = 50;

export function isBeforeBook(at: string, startDate: string): boolean {
  return at.slice(0, 10) < startDate;
}

export const DEFAULT_EXPIRY_HOURS = 48;
export const MAX_EXPIRY_HOURS = 96;

export interface MirrorExtraction {
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
}

export function extractionIdOf(x: Pick<MirrorExtraction, 'structureId' | 'extractionStartTime'>) {
  return `${x.structureId}_${Date.parse(x.extractionStartTime)}`;
}

export function moonOnDay(
  extractions: readonly MirrorExtraction[],
  expiryHours: Readonly<Record<string, number>>,
  structureId: number | undefined,
  date: string
): { moonId?: number; extractionId?: string } {
  const now = Date.parse(`${date}T23:59:59Z`);
  for (const x of extractions) {
    if (x.structureId !== structureId || x.cancelledAt) continue;
    if (now < Date.parse(x.chunkArrivalTime)) continue;
    const fracturedAt = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
    if (now < fracturedAt) continue;
    const hours = Math.min(
      expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
      MAX_EXPIRY_HOURS
    );
    const expiresAt = fracturedAt + hours * HOUR_MS;
    if (
      date >= new Date(fracturedAt).toISOString().slice(0, 10) &&
      date <= new Date(expiresAt).toISOString().slice(0, 10)
    ) {
      return { moonId: x.moonId, extractionId: extractionIdOf(x) };
    }
  }
  return {};
}

export const FORFEIT_NO_REPLY_DAYS = 90;

export type ForfeitBasis =
  { kind: 'consent'; note: string } | { kind: 'no-reply'; askedAt: string };

export function forfeitAllowed(basis: ForfeitBasis, today: string): boolean {
  if (basis.kind === 'consent') return basis.note.trim().length > 0;
  return basis.askedAt <= shiftDate(today, -FORFEIT_NO_REPLY_DAYS);
}

export interface CoveragePeriod {
  from: string;
  to?: string;
}

export function isDayCovered(periods: readonly CoveragePeriod[], day: string): boolean {
  return periods.some((p) => day >= p.from && (p.to === undefined || day <= p.to));
}

export function closePeriod(
  periods: readonly CoveragePeriod[],
  effectiveDay: string
): CoveragePeriod[] {
  const to = shiftDate(effectiveDay, -1);
  return periods.flatMap((p) => {
    if (p.to !== undefined) return [p];
    return to < p.from ? [] : [{ from: p.from, to }];
  });
}

export function reopenPeriod(periods: readonly CoveragePeriod[], day: string): CoveragePeriod[] {
  for (const p of periods) {
    if (p.to === undefined) throw new Error('a coverage period is still open');
    if (day <= p.to) throw new Error('a new coverage period cannot overlap an earlier one');
  }
  return [...periods, { from: day }];
}

export const MAX_COVERAGE_BACKDATE_DAYS = 30;

export function clampCoverageFrom(
  periods: readonly CoveragePeriod[],
  requested: string | undefined,
  today: string
): string {
  const earliest = shiftDate(today, -MAX_COVERAGE_BACKDATE_DAYS);
  let day = requested ?? today;
  if (day > today) day = today;
  if (day < earliest) day = earliest;
  for (const p of periods) {
    if (p.to === undefined) continue;
    const next = shiftDate(p.to, 1);
    if (day < next) day = next;
  }
  return day;
}

export function reconnectCoverageFrom(
  periods: readonly CoveragePeriod[],
  today: string,
  joinedOn?: string
): string {
  if (!periods.some((p) => p.to !== undefined)) return today;
  const earliest = shiftDate(today, -MAX_COVERAGE_BACKDATE_DAYS);
  const asked = joinedOn !== undefined && joinedOn > earliest ? joinedOn : earliest;
  return clampCoverageFrom(periods, asked, today);
}

export const FEEDER_DISCONNECT_DAYS = 30;

export interface FeederHealth {
  status: 'active' | 'disconnected';
  lastReadWellAt?: string;
  staleSince?: string;
}

export type FeederReadOutcome = 'ok' | 'stale' | 'none';

export function advanceFeederHealth(
  prev: FeederHealth,
  outcome: FeederReadOutcome,
  now: string
): FeederHealth {
  if (prev.status === 'disconnected') return prev;
  if (outcome === 'ok') return { status: 'active', lastReadWellAt: now };
  const staleSince = outcome === 'stale' ? (prev.staleSince ?? now) : prev.staleSince;
  const next: FeederHealth = { ...prev, ...(staleSince !== undefined ? { staleSince } : {}) };
  if (
    staleSince !== undefined &&
    Date.parse(now) - Date.parse(staleSince) >= FEEDER_DISCONNECT_DAYS * DAY_MS
  ) {
    return { ...next, status: 'disconnected' };
  }
  return next;
}

export function disconnectedCoverage(
  periods: readonly CoveragePeriod[],
  health: Pick<FeederHealth, 'lastReadWellAt'>,
  graceHours: number = BOOK_DEFAULTS.graceHours
): CoveragePeriod[] {
  if (health.lastReadWellAt === undefined) {
    const open = periods.find((p) => p.to === undefined);
    return open ? closePeriod(periods, open.from) : [...periods];
  }
  const closedBy = Date.parse(health.lastReadWellAt) - graceHours * HOUR_MS;
  const lastFull = shiftDate(new Date(closedBy).toISOString().slice(0, 10), -1);
  return closePeriod(periods, shiftDate(lastFull, 1));
}

export interface OwnerRateEntry {
  kind: 'requested' | 'agreed';
  pct: number;
  effectiveFrom: string;
  recordedAt: string;
  noBackdate?: true;
}

export function latestOwnerRate(
  history: readonly OwnerRateEntry[],
  kind: OwnerRateEntry['kind'],
  date: string
): OwnerRateEntry | undefined {
  let best: OwnerRateEntry | undefined;
  for (const entry of history) {
    if (entry.kind !== kind || entry.effectiveFrom > date) continue;
    if (
      !best ||
      entry.effectiveFrom > best.effectiveFrom ||
      (entry.effectiveFrom === best.effectiveFrom && entry.recordedAt >= best.recordedAt)
    )
      best = entry;
  }
  return best;
}

function firstAgreedOwnerRate(history: readonly OwnerRateEntry[]): OwnerRateEntry | undefined {
  let first: OwnerRateEntry | undefined;
  for (const entry of history) {
    if (entry.kind !== 'agreed') continue;
    if (
      !first ||
      entry.effectiveFrom < first.effectiveFrom ||
      (entry.effectiveFrom === first.effectiveFrom && entry.recordedAt < first.recordedAt)
    )
      first = entry;
  }
  return first;
}

export function effectiveOwnerRatePct(
  history: readonly OwnerRateEntry[],
  date: string
): number | undefined {
  const first = firstAgreedOwnerRate(history);
  return (latestOwnerRate(history, 'agreed', date) ?? (first?.noBackdate ? undefined : first))?.pct;
}

export const FEEDER_VIEW_RULES = 2;

export type FeederMode = 'normal' | 'settled-otherwise';

export interface FeederModeChange {
  from: string;
  mode: FeederMode;
}

export interface FeederPayoutAmount {
  amount: number;
  notAPayout: boolean;
}

function isSettledOn(changes: readonly FeederModeChange[], day: string): boolean {
  let latest: FeederModeChange | undefined;
  for (const c of changes) if (c.from <= day && (!latest || c.from >= latest.from)) latest = c;
  return latest?.mode === 'settled-otherwise';
}

export function accrueValuedDays(
  days: readonly { date: string; value: number }[],
  rules: {
    coveragePeriods: readonly CoveragePeriod[];
    ownerRateHistory: readonly OwnerRateEntry[];
    modeChanges: readonly FeederModeChange[];
    isBillable: (day: string) => boolean;
  }
): {
  byDay: { date: string; value: number; pct: number; due: number }[];
  accrued: number;
  pending: { date: string; value: number }[];
} {
  const byDay: { date: string; value: number; pct: number; due: number }[] = [];
  const pending: { date: string; value: number }[] = [];
  for (const { date, value } of [...days].sort((x, y) => x.date.localeCompare(y.date))) {
    if (!isDayCovered(rules.coveragePeriods, date) || !rules.isBillable(date)) continue;
    if (isSettledOn(rules.modeChanges, date)) continue;
    const pct = effectiveOwnerRatePct(rules.ownerRateHistory, date);
    if (pct === undefined) {
      pending.push({ date, value });
      continue;
    }
    byDay.push({ date, value, pct, due: (value * pct) / 100 });
  }
  return { byDay, accrued: byDay.reduce((sum, d) => sum + d.due, 0), pending };
}

export function feederBalance(
  accrued: number,
  payouts: readonly FeederPayoutAmount[],
  settledOtherwise = false
) {
  const kindOf = (isk: number, balance: number): 'owed' | 'credit' | 'even' =>
    isk === 0 ? 'even' : balance > 0 ? 'owed' : 'credit';
  const paid = payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);
  const balance = accrued - paid;
  const isk = Math.floor(Math.abs(balance));
  const kind = kindOf(isk, balance);
  if (settledOtherwise && kind !== 'owed')
    return { balance, display: { kind: 'none' as const, isk: 0 } };
  return { balance, display: { kind, isk } };
}

export function onPayList(balance: { display: { kind: string } }): boolean {
  return balance.display.kind === 'owed';
}

export interface FeederPayout extends FeederPayoutAmount {
  date: string;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
  journalRef?: number;
  unconfirmed?: boolean;
  disputedAt?: number;
}

export function dayClosesAt(date: string, graceHours: number = BOOK_DEFAULTS.graceHours): string {
  return new Date(
    Date.parse(`${shiftDate(date, 1)}T00:00:00Z`) + graceHours * HOUR_MS
  ).toISOString();
}

export function feederBillableRule(
  lastReadWellAt: number | undefined,
  graceHours: number
): (day: string) => boolean {
  return (day) =>
    lastReadWellAt !== undefined && lastReadWellAt >= Date.parse(dayClosesAt(day, graceHours));
}

export interface FeederRulesRecord {
  joinedAt: number;
  mode?: FeederMode;
  requestedRatePct?: number;
  agreedRatePct?: number;
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
}

export function deriveOwnerRateHistory(record: FeederRulesRecord): OwnerRateEntry[] {
  if (record.ownerRateHistory) return record.ownerRateHistory;
  const effectiveFrom = new Date(record.joinedAt).toISOString().slice(0, 10);
  const recordedAt = new Date(record.joinedAt).toISOString();
  const out: OwnerRateEntry[] = [];
  if (record.requestedRatePct !== undefined)
    out.push({ kind: 'requested', pct: record.requestedRatePct, effectiveFrom, recordedAt });
  if (record.agreedRatePct !== undefined)
    out.push({ kind: 'agreed', pct: record.agreedRatePct, effectiveFrom, recordedAt });
  return out;
}

export function deriveModeChanges(record: FeederRulesRecord): FeederModeChange[] {
  if (record.modeChanges) return record.modeChanges;
  return record.mode === 'settled-otherwise'
    ? [{ from: new Date(record.joinedAt).toISOString().slice(0, 10), mode: 'settled-otherwise' }]
    : [];
}

export function moonOwnerUnitPrice(
  side: { buy?: number | null; sell?: number | null } | undefined,
  billed?: number
): number {
  if (side?.buy != null && side.buy > 0) return side.buy;
  if (side?.sell != null && side.sell > 0) return side.sell;
  if (billed !== undefined && billed > 0) return billed;
  return 0;
}

export function oreFormTypeId(
  rawTypeId: number,
  compressedByRaw: Readonly<Record<string, number>>,
  compressed: boolean
): number {
  return compressed ? (compressedByRaw[String(rawTypeId)] ?? rawTypeId) : rawTypeId;
}

export const REMOVAL_WAIT_MS = 24 * HOUR_MS;

const PAYEE_LOOKBACK_MS = 48 * HOUR_MS;

export interface Removal {
  startedAt: number;
  startedBy: number;
  startedByName: string;
  noticeAt?: number;
  effectiveAt?: number;
}

export type RemovableStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

export interface RemovalState {
  status: RemovableStatus;
  removal?: Removal;
}

export function canStartRemoval(state: RemovalState): boolean {
  return state.status === 'active';
}

export function startRemoval(
  state: RemovalState,
  by: { characterId: number; name: string },
  now: number
): RemovalState {
  if (!canStartRemoval(state)) throw new Error('only an active moon owner can be removed');
  return {
    status: 'pending-removal',
    removal: { startedAt: now, startedBy: by.characterId, startedByName: by.name },
  };
}

export function recordRemovalNotice(state: RemovalState, noticeAt: number): RemovalState {
  const { removal } = state;
  if (state.status !== 'pending-removal' || !removal || removal.effectiveAt !== undefined) {
    return state;
  }
  return {
    ...state,
    removal: { ...removal, noticeAt, effectiveAt: noticeAt + REMOVAL_WAIT_MS },
  };
}

export function cancelRemoval(state: RemovalState): RemovalState {
  if (state.status !== 'pending-removal') throw new Error('no removal is pending');
  return { status: 'active' };
}

export function isRemovalDue(state: RemovalState, now: number): boolean {
  const at = state.removal?.effectiveAt;
  return state.status === 'pending-removal' && at !== undefined && at <= now;
}

export function moonOwnerMailRecipients(input: {
  ceoId: number | null;
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeCeoId?: number | null;
}): number[] {
  const payeeId = input.payee?.kind === 'character' ? input.payee.id : (input.payeeCeoId ?? null);
  return [...new Set([input.ceoId, payeeId].filter((id): id is number => typeof id === 'number'))];
}

export function removalRecipients(input: {
  officerIds: readonly number[];
  startedBy: number;
  ceoId: number | null;
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeCeoId?: number | null;
}): number[] {
  const out = new Set<number>(moonOwnerMailRecipients(input));
  for (const id of input.officerIds) if (id !== input.startedBy) out.add(id);
  return [...out];
}

export function payeeMayForce(input: {
  payeeChangedAt: number | undefined;
  removalStartedAt: number;
  payeeSetBy?: 'accounting' | 'moon-owner' | undefined;
}): boolean {
  const { payeeChangedAt, removalStartedAt } = input;
  if (input.payeeSetBy === 'accounting') return false;
  if (payeeChangedAt === undefined) return true;
  return payeeChangedAt < removalStartedAt - PAYEE_LOOKBACK_MS;
}

export function isPayeeActor(input: {
  payee: { kind: 'corporation' | 'character'; id: number } | undefined;
  characterId: number;
  payeeCorporationCeoId: number | undefined;
}): boolean {
  const { payee, characterId } = input;
  if (!payee) return false;
  return payee.kind === 'character'
    ? payee.id === characterId
    : input.payeeCorporationCeoId === characterId;
}

export function withPayee<T extends { payee?: { kind: 'corporation' | 'character'; id: number } }>(
  rec: T,
  payee: { kind: 'corporation' | 'character'; id: number },
  now: number
): T & { payeeChangedAt?: number } {
  const same = rec.payee?.kind === payee.kind && rec.payee.id === payee.id;
  const prior = (rec as { payeeChangedAt?: number }).payeeChangedAt;
  return {
    ...rec,
    payee,
    ...(same ? (prior !== undefined ? { payeeChangedAt: prior } : {}) : { payeeChangedAt: now }),
  };
}

export interface OutgoingDonation {
  refId: number;
  division: number;
  recipientId: number;
  amount: number;
  at: string;
  reason?: string;
}

export interface JournalEntryOut {
  id: number;
  date: string;
  ref_type: string;
  amount?: number;
  first_party_id?: number;
  second_party_id?: number;
  reason?: string;
}

export { PAYOUT_LINK_WINDOW_DAYS };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const payoutId = (d: Pick<OutgoingDonation, 'division' | 'refId'>) =>
  `j${d.division}_${d.refId}`;

const dayIndex = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

const OUTGOING_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'corporation_account_withdrawal',
]);

export function outgoingDonationsFromJournal(
  entries: readonly JournalEntryOut[],
  division: number,
  corporationId: number
): OutgoingDonation[] {
  const out: OutgoingDonation[] = [];
  for (const e of entries) {
    if (!OUTGOING_REF_TYPES.has(e.ref_type)) continue;
    if (!(typeof e.amount === 'number' && e.amount < 0)) continue;
    if (e.first_party_id !== corporationId || e.second_party_id === undefined) continue;
    if (e.second_party_id === corporationId) continue;
    if (!Number.isSafeInteger(e.id) || Number.isNaN(Date.parse(e.date))) continue;
    out.push({
      refId: e.id,
      division,
      recipientId: e.second_party_id,
      amount: Math.round(-e.amount),
      at: new Date(e.date).toISOString(),
      ...(e.reason ? { reason: e.reason } : {}),
    });
  }
  return out;
}

type StoredPayout = FeederPayout & { id: string; confirmedAt?: number };

export interface PayoutReconciliation {
  attach: { id: string; journalRef: number }[];
  create: { id: string; payout: FeederPayout }[];
}

export type Payee = { kind: 'corporation' | 'character'; id: number };

export interface PayeeChange {
  payee: Payee;
  from: number;
}

export function payeeIdsAt(
  owner: { corporationId: number; payee?: Payee; payeeHistory?: readonly PayeeChange[] },
  at: string
): Set<number> {
  const ids = new Set([owner.corporationId]);
  const history = owner.payeeHistory;
  if (!history || history.length === 0) {
    if (owner.payee) ids.add(owner.payee.id);
    return ids;
  }
  const t = Date.parse(at);
  const inForce = history.filter((h) => h.from <= t).at(-1);
  if (inForce) ids.add(inForce.payee.id);
  return ids;
}

export function withPayeeChange(
  rec: { payee?: Payee; payeeChangedAt?: number; payeeHistory?: readonly PayeeChange[] },
  payee: Payee,
  now: number
): PayeeChange[] {
  const history: PayeeChange[] = rec.payeeHistory
    ? [...rec.payeeHistory]
    : rec.payee
      ? [{ payee: rec.payee, from: rec.payeeChangedAt ?? 0 }]
      : [];
  const last = history.at(-1)?.payee;
  if (last?.kind === payee.kind && last.id === payee.id) return history;
  return [...history, { payee, from: now }];
}

export interface OwnerOutgoing {
  corporationId: number;
  payee?: Payee;
  payeeHistory?: readonly PayeeChange[];
  payouts: readonly StoredPayout[];
  since: string;
}

const dayGap = (date: string, at: string) => Math.abs(dayIndex(date) - dayIndex(at));

export const PAYOUT_REASON_PREFIX = 'Moon mining payout';

export const carriesPayoutReference = (reason: string | undefined): boolean =>
  reason !== undefined && reason.toLowerCase().includes(PAYOUT_REASON_PREFIX.toLowerCase());

export function reconcileBookOutgoing(input: {
  owners: readonly OwnerOutgoing[];
  outgoing: readonly OutgoingDonation[];
}): (PayoutReconciliation & { corporationId: number })[] {
  const results = input.owners.map((o) => ({
    corporationId: o.corporationId,
    attach: [] as PayoutReconciliation['attach'],
    create: [] as PayoutReconciliation['create'],
  }));
  const seen = new Set(
    input.owners.flatMap((o) =>
      o.payouts.flatMap((p) => (p.journalRef === undefined ? [] : [p.journalRef]))
    )
  );
  const open = input.owners.map((o) =>
    o.payouts.filter((p) => p.journalRef === undefined && !p.notAPayout && p.method === 'donation')
  );
  const taken = new Set<string>();
  const sorted = [...input.outgoing].sort((a, b) => a.at.localeCompare(b.at) || a.refId - b.refId);
  for (const d of sorted) {
    if (seen.has(d.refId)) continue;
    const owners = input.owners.flatMap((o, i) =>
      payeeIdsAt(o, d.at).has(d.recipientId) ? [i] : []
    );
    if (owners.length === 0) continue;
    seen.add(d.refId);
    const amount = Math.round(d.amount);
    const near = owners
      .flatMap((i) =>
        (open[i] ?? []).map((p) => ({ i, p, key: `${input.owners[i]!.corporationId}:${p.id}` }))
      )
      .filter(
        ({ p, key }) =>
          !taken.has(key) && p.amount === amount && dayGap(p.date, d.at) <= PAYOUT_LINK_WINDOW_DAYS
      )
      .sort(
        (a, b) =>
          dayGap(a.p.date, d.at) - dayGap(b.p.date, d.at) ||
          input.owners[a.i]!.corporationId - input.owners[b.i]!.corporationId ||
          a.p.id.localeCompare(b.p.id)
      )[0];
    if (near) {
      taken.add(near.key);
      results[near.i]!.attach.push({ id: near.p.id, journalRef: d.refId });
      continue;
    }
    if (owners.length > 1) continue;
    const i = owners[0]!;
    const date = d.at.slice(0, 10);
    if (date < input.owners[i]!.since) continue;
    const referenced = carriesPayoutReference(d.reason);
    results[i]!.create.push({
      id: payoutId(d),
      payout: {
        date,
        amount,
        method: 'donation',
        status: 'matched',
        journalRef: d.refId,
        notAPayout: !referenced,
        ...(referenced ? {} : { unconfirmed: true }),
      },
    });
  }
  return results;
}

const AUTO_RECORDED = /^j\d+_\d+$/;

export function payoutToMerge(
  stored: readonly StoredPayout[],
  recorded: { amount: number; date: string; method: 'donation' | 'contract' | 'other' }
): string | undefined {
  if (recorded.method !== 'donation') return undefined;
  return stored
    .filter(
      (p) =>
        AUTO_RECORDED.test(p.id) &&
        p.journalRef !== undefined &&
        (!p.notAPayout || p.unconfirmed === true) &&
        p.confirmedAt === undefined &&
        p.method === 'donation' &&
        p.amount === recorded.amount &&
        dayGap(p.date, recorded.date) <= PAYOUT_LINK_WINDOW_DAYS
    )
    .sort(
      (a, b) =>
        dayGap(a.date, recorded.date) - dayGap(b.date, recorded.date) || a.id.localeCompare(b.id)
    )[0]?.id;
}

export function buildRecordedPayout(input: {
  amount: number;
  date: string;
  method: 'donation' | 'contract' | 'other';
}): FeederPayout {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error('amount must be whole ISK above zero');
  }
  if (!DATE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    throw new Error('date must be a day');
  }
  const method = input.method === 'donation' ? 'donation' : 'other';
  return {
    date: input.date,
    amount: input.amount,
    method,
    status: method === 'donation' ? 'waiting-for-journal' : 'recorded',
    notAPayout: false,
  };
}

export function balanceAfter(
  balance: number,
  sent: number
): { kind: 'owed' | 'credit' | 'even' | 'none'; isk: number } {
  const left = balance - sent;
  const isk = Math.floor(Math.abs(left));
  return { kind: isk === 0 ? 'even' : left > 0 ? 'owed' : 'credit', isk };
}

export function payoutPeriod(
  days: readonly { date: string }[],
  payouts: readonly Pick<FeederPayout, 'date' | 'notAPayout'>[]
): { from: string; to: string } | undefined {
  const dates = days.map((d) => d.date).sort();
  if (dates.length === 0) return undefined;
  const lastPaid = payouts
    .filter((p) => !p.notAPayout)
    .map((p) => p.date)
    .sort()
    .at(-1);
  const to = dates[dates.length - 1] as string;
  const after = lastPaid === undefined ? dates : dates.filter((d) => d > lastPaid);
  return { from: (after[0] ?? dates[0]) as string, to };
}

export function payoutReason(prefix: string, period: { from: string; to: string } | undefined) {
  return period ? `${prefix}, ${period.from} to ${period.to}` : prefix;
}

export const DISPUTE_HOLD_DAYS = 14;

export interface HoldingDispute {
  lines: readonly { recordKey: string; typeId: number; quantity: number }[];
  at: string;
  holdFrom?: string;
  resolution?: unknown;
  kind?: string;
  claimedPct?: number;
}

export function disputeHolds(
  dispute: Pick<HoldingDispute, 'at' | 'resolution' | 'holdFrom'>,
  now: string
): boolean {
  if (dispute.resolution) return false;
  return Date.parse(now) < Date.parse(dispute.holdFrom ?? dispute.at) + DISPUTE_HOLD_DAYS * DAY_MS;
}

export function readHoldingDisputes(raw: readonly unknown[]): (HoldingDispute & {
  minerId: string;
})[] {
  const out: (HoldingDispute & { minerId: string })[] = [];
  for (const d of raw) {
    if (!isPlainRecord(d)) continue;
    const { id, minerId, date, by, at, kind, claimedPct, holdFrom, resolution } = d;
    const lines = Array.isArray(d.lines)
      ? d.lines.map((l) =>
          isPlainRecord(l) &&
          typeof l.recordKey === 'string' &&
          typeof l.typeId === 'number' &&
          typeof l.quantity === 'number' &&
          typeof l.payeeName === 'string'
            ? { recordKey: l.recordKey, typeId: l.typeId, quantity: l.quantity }
            : null
        )
      : [];
    if (
      typeof id !== 'string' ||
      typeof minerId !== 'string' ||
      typeof date !== 'string' ||
      typeof by !== 'number' ||
      typeof at !== 'string' ||
      lines.length === 0 ||
      lines.some((l) => l === null)
    )
      continue;
    const answered =
      isPlainRecord(resolution) &&
      typeof resolution.at === 'string' &&
      typeof resolution.by === 'number' &&
      typeof resolution.reason === 'string' &&
      (resolution.kind === 'rejected' ||
        (resolution.kind === 'dismissed' && typeof resolution.amountIsk === 'number'));
    out.push({
      minerId,
      lines: lines as HoldingDispute['lines'],
      at,
      ...(typeof holdFrom === 'string' && Number.isFinite(Date.parse(holdFrom))
        ? { holdFrom }
        : {}),
      ...(kind === 'quantity' || kind === 'rate' || kind === 'notPaying' ? { kind } : {}),
      ...(typeof claimedPct === 'number' && Number.isFinite(claimedPct) ? { claimedPct } : {}),
      ...(answered ? { resolution } : {}),
    });
  }
  return out;
}

export const MOON_ORE_VARIANTS: ReadonlyMap<number, readonly [number, number]> = new Map([
  [45490, [46280, 46281]],
  [45491, [46282, 46283]],
  [45492, [46284, 46285]],
  [45493, [46286, 46287]],
  [45494, [46288, 46289]],
  [45495, [46290, 46291]],
  [45496, [46292, 46293]],
  [45497, [46294, 46295]],
  [45498, [46296, 46297]],
  [45499, [46298, 46299]],
  [45500, [46300, 46301]],
  [45501, [46302, 46303]],
  [45502, [46304, 46305]],
  [45503, [46306, 46307]],
  [45504, [46308, 46309]],
  [45506, [46310, 46311]],
  [45510, [46312, 46313]],
  [45511, [46314, 46315]],
  [45512, [46316, 46317]],
  [45513, [46318, 46319]],
]);

const VARIANT_BASE = new Map(
  [...MOON_ORE_VARIANTS].flatMap(([base, variants]) => variants.map((v) => [v, base] as const))
);

export const moonOreBaseOf = (typeId: number): number => VARIANT_BASE.get(typeId) ?? typeId;

interface OreQty {
  typeId: number;
  quantity: number;
}

function sumByType(lines: readonly OreQty[]): Map<number, number> {
  const sums = new Map<number, number>();
  for (const l of lines) sums.set(l.typeId, (sums.get(l.typeId) ?? 0) + l.quantity);
  return sums;
}

const familyOf = (base: number, lines: readonly OreQty[]): Map<number, number> =>
  sumByType(lines.filter((l) => l.quantity > 0 && moonOreBaseOf(l.typeId) === base));

function shareOut(total: number, weights: ReadonlyMap<number, number>): OreQty[] {
  const sum = [...weights.values()].reduce((s, w) => s + w, 0);
  const parts = [...weights]
    .sort(([a], [b]) => a - b)
    .map(([typeId, w]) => ({ typeId, quantity: Math.floor((total * w) / sum), w }));
  const largest = parts.reduce((best, p) => (p.w > best.w ? p : best));
  largest.quantity += total - parts.reduce((s, p) => s + p.quantity, 0);
  return parts.map(({ typeId, quantity }) => ({ typeId, quantity }));
}

export function splitChunkVariants(
  chunk: readonly OreQty[],
  mined: readonly OreQty[],
  survey: readonly OreQty[] = []
): OreQty[] {
  const out: OreQty[] = [];
  const done = new Set<number>();
  for (const line of chunk) {
    const base = moonOreBaseOf(line.typeId);
    if (!MOON_ORE_VARIANTS.has(base)) {
      out.push(line);
      continue;
    }
    if (done.has(base)) continue;
    done.add(base);
    const family = chunk.filter((l) => moonOreBaseOf(l.typeId) === base);
    const alreadySplit = family.some((l) => l.typeId !== base);
    let weights = familyOf(base, mined);
    if (weights.size === 0 && !alreadySplit) weights = familyOf(base, survey);
    if (weights.size === 0) {
      out.push(...family);
      continue;
    }
    out.push(
      ...shareOut(
        family.reduce((s, l) => s + l.quantity, 0),
        weights
      )
    );
  }
  return out;
}

export function chunkMinedPct(chunk: readonly OreQty[], mined: readonly OreQty[]): number | null {
  const got = sumByType(mined);
  const lines = splitChunkVariants(chunk, mined);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  if (total <= 0) return null;
  const share = lines.reduce((s, l) => s + Math.min(l.quantity, got.get(l.typeId) ?? 0), 0);
  return Math.min(100, Math.round((share / total) * 100));
}
