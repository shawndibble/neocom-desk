// The slice of the Corp Tax Book engine (src/engine/corpTaxBook, issue #4059)
// that the callables enforce. `functions/` is a separate NodeNext package that
// cannot import `src/`, so — as marketOpenPrices.ts does for the trade hubs —
// this is a small mirror kept honest by a parity test in the root suite
// (src/engine/corpTaxBook/functionsMirror.test.ts), which runs both copies on
// the same inputs. Change the engine first, then this file. Dependency-free on
// purpose so that test can import it from the root package.

export interface ObservedRow {
  structureId: number;
  characterId: number;
  recordedCorporationId: number;
  typeId: number;
  date: string;
  quantity: number;
  cachedAt: string;
  /** Where the refinery is and which moon it drilled, when the syncing officer's client knew (#4065). */
  solarSystemId?: number;
  moonId?: number;
  /** The feeder corporation that recorded the row; absent is the book's own. */
  sourceCorporationId?: number;
}

/** The upsert key: miner + ore + day + structure (engine `observedRowKey`). */
export function observedRowKey(row: ObservedRow): string {
  return `${row.characterId}:${row.typeId}:${row.date}:${row.structureId}`;
}

export interface ObservedMerge {
  rows: ObservedRow[];
  changed: ObservedRow[];
}

/** Engine `mergeObservedRows`: quantity never goes down; an older ESI cache is ignored. */
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

/** Engine `isRetroactiveRate`. The start-date rate at book creation skips it. */
export function isRetroactiveRate(effectiveFrom: string, today: string): boolean {
  return effectiveFrom < today;
}

/** The fields of a stored Statement the date rules read. */
export interface StatementDays {
  id: string;
  coversFrom: string;
  coversThrough: string;
  lines: { kind: string; date: string }[];
}

/** Engine `statementDays`. */
export function statementDays(statement: StatementDays): Set<string> {
  const days = new Set<string>();
  for (let d = statement.coversFrom; d <= statement.coversThrough; d = shiftDate(d, 1)) days.add(d);
  for (const line of statement.lines) if (line.kind !== 'correction') days.add(line.date);
  return days;
}

/** Engine `canOverrideRecordRate` over `daysOnStatements`. */
export function canOverrideRecordRate(date: string, statements: readonly StatementDays[]): boolean {
  return !statements.some((s) => statementDays(s).has(date));
}

/** Engine `canRebillFrom` (D22): never reaches a day a paid Statement covered. */
export function canRebillFrom(
  date: string,
  statements: readonly StatementDays[],
  paidStatementIds: ReadonlySet<string>
): boolean {
  return statements.every((s) => !paidStatementIds.has(s.id) || date > s.coversThrough);
}

// Book defaults (hand-off from #4059: they live in the backend, not the engine).
// Grace, minimum Statement and Overdue days equal the engine's
// DEFAULT_GRACE_HOURS, DEFAULT_MINIMUM_STATEMENT and DEFAULT_OVERDUE_DAYS.
export const BOOK_DEFAULTS = {
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 6,
  minimumStatement: 5_000_000,
  overdueDays: 14,
  divisions: [1],
  cadence: { kind: 'monthly' },
} as const;

// --- Payment allocation (issue #4066) ---------------------------------------
// Mirror of src/engine/corpTaxBook/allocation.ts `allocatePayments`, so the
// verify link can show which payments were credited to one Statement.
// functionsMirror.test.ts keeps the two in step.

export interface AllocStatement {
  id: string;
  amount: number;
  issuedAt: string;
}

export interface AllocPayment {
  id: string;
  amount: number;
  at: string;
  statementId?: string;
  notTaxAmount?: number;
  source?: 'donation' | 'manual';
}

export interface AllocDismissalCredit {
  statementId: string;
  amount: number;
}

export function settleTolerance(amount: number): number {
  return Math.max((amount * 0.5) / 100, 100_000);
}

/** Mirror of allocation.ts `isBeforeBook`. */
export function isBeforeBook(at: string, startDate: string): boolean {
  return at.slice(0, 10) < startDate;
}

export function allocatePayments(rawInput: {
  statements: readonly AllocStatement[];
  payments: readonly AllocPayment[];
  dismissalCredits: readonly AllocDismissalCredit[];
  startDate?: string;
}) {
  const { startDate } = rawInput;
  const input = {
    ...rawInput,
    payments: startDate
      ? rawInput.payments.filter((p) => p.source !== 'donation' || !isBeforeBook(p.at, startDate))
      : rawInput.payments,
  };
  const ordered = [...input.statements].sort(
    (a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id)
  );
  type Running = { amount: number; credited: number; paidIn: number };
  const state = new Map<string, Running>(
    ordered.map((s) => [s.id, { amount: s.amount, credited: 0, paidIn: 0 }])
  );
  const isDone = (st: Running): boolean => {
    const remaining = st.amount - st.credited;
    return remaining <= 0 || (st.paidIn > 0 && remaining <= settleTolerance(st.amount));
  };
  const apply = (id: string, available: number, isPayment: boolean): number => {
    const st = state.get(id);
    if (!st || isDone(st)) return available;
    const take = Math.min(available, st.amount - st.credited);
    st.credited += take;
    if (isPayment) st.paidIn += take;
    return available - take;
  };
  const applyOldestFirst = (available: number, isPayment: boolean): number => {
    for (const s of ordered) {
      if (available <= 0) break;
      available = apply(s.id, available, isPayment);
    }
    return available;
  };

  let credit = ordered.reduce((sum, s) => sum + Math.max(0, -s.amount), 0);
  let paid = 0;
  let dismissed = 0;
  for (const d of input.dismissalCredits) {
    dismissed += d.amount;
    credit += applyOldestFirst(apply(d.statementId, d.amount, false), false);
  }
  const payments = [...input.payments].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  );
  const paymentCredits: { paymentId: string; statementId: string; amount: number }[] = [];
  for (const p of payments) {
    let available = p.amount - Math.min(p.notTaxAmount ?? 0, p.amount);
    paid += available;
    const before = new Map([...state].map(([id, st]) => [id, st.credited]));
    if (p.statementId) available = apply(p.statementId, available, true);
    credit += applyOldestFirst(available, true);
    for (const [id, st] of state) {
      const amount = st.credited - (before.get(id) ?? 0);
      if (amount > 0) paymentCredits.push({ paymentId: p.id, statementId: id, amount });
    }
  }

  const byStatement = new Map<
    string,
    { amount: number; credited: number; writtenOff: number; remaining: number; settled: boolean }
  >();
  let billed = 0;
  let writtenOffTotal = 0;
  for (const s of ordered) {
    const st = state.get(s.id)!;
    billed += st.amount;
    const settled = isDone(st);
    const shortfall = Math.max(0, st.amount - st.credited);
    const writtenOff = settled ? shortfall : 0;
    writtenOffTotal += writtenOff;
    byStatement.set(s.id, {
      amount: st.amount,
      credited: st.credited,
      writtenOff,
      remaining: shortfall - writtenOff,
      settled,
    });
  }
  return {
    byStatement,
    paymentCredits,
    credit,
    balance: billed - paid - dismissed - writtenOffTotal,
  };
}

// --- Dismissal credits (issue #4184) -----------------------------------------
// Mirror of src/engine/corpTaxBook/{dismissals,extraction,sync,allocation}.ts
// for the verify read: which Statement lines an active record, Miner, moon or
// Extraction dismissal waives. functionsMirror.test.ts keeps them in step.

const HOUR_MS = 3_600_000;
const DEFAULT_EXPIRY_HOURS = 48;
const MAX_EXPIRY_HOURS = 96;

/** A stored Extraction, as `syncBook` writes it. */
export interface MirrorExtraction {
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
}

/** Engine `extractionId`. */
export function extractionIdOf(x: Pick<MirrorExtraction, 'structureId' | 'extractionStartTime'>) {
  return `${x.structureId}_${Date.parse(x.extractionStartTime)}`;
}

/**
 * Engine `moonOnDay`/`placeOfFactory`: the moon and Extraction a refinery was
 * working on a date, from the day the chunk fractured to the day its belt
 * expired. `expiryHours` is the book's per-structure override.
 */
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

export interface MirrorDismissal {
  scope?: string;
  targetId?: string;
  at?: string;
  reversed?: unknown;
}

export interface DismissableLine {
  chargeKey?: string;
  date?: string;
  tax?: number;
  structureId?: number;
}

/**
 * Engine `dismissalCredits`: the credit active dismissals give a Miner's billed
 * days. A Miner or moon dismissal waives what was mined up to the day it was
 * made; a record or Extraction one is exact.
 */
export function dismissalCredits(input: {
  minerId: string;
  statements: readonly { id: string; lines: readonly DismissableLine[] }[];
  dismissals: readonly MirrorDismissal[];
  extractions: readonly MirrorExtraction[];
  expiryHours: Readonly<Record<string, number>>;
}): AllocDismissalCredit[] {
  const active = input.dismissals.filter((d) => !d.reversed);
  const credits: AllocDismissalCredit[] = [];
  for (const st of input.statements) {
    for (const line of st.lines) {
      if (!line.chargeKey) continue;
      const date = line.date ?? '';
      const place = moonOnDay(input.extractions, input.expiryHours, line.structureId, date);
      const hit = active.find((d) => {
        const waivedUpTo = date <= (d.at ?? '').slice(0, 10);
        switch (d.scope) {
          case 'record':
            return d.targetId === line.chargeKey;
          case 'extraction':
            return place.extractionId !== undefined && d.targetId === place.extractionId;
          case 'miner':
            return d.targetId === input.minerId && waivedUpTo;
          case 'moon':
            return place.moonId !== undefined && d.targetId === String(place.moonId) && waivedUpTo;
          default:
            return false;
        }
      });
      if (hit) credits.push({ statementId: st.id, amount: line.tax ?? 0 });
    }
  }
  return credits;
}

// --- Guest close-account (issue #4184) ---------------------------------------

/** A guest's credit is forfeited without consent only after this many days with no reply. */
export const FORFEIT_NO_REPLY_DAYS = 90;

export type ForfeitBasis =
  { kind: 'consent'; note: string } | { kind: 'no-reply'; askedAt: string };

/** Engine `forfeitAllowed`: consent is recorded in words, or 90 days passed since the guest was asked. */
export function forfeitAllowed(basis: ForfeitBasis, today: string): boolean {
  if (basis.kind === 'consent') return basis.note.trim().length > 0;
  return basis.askedAt <= shiftDate(today, -FORFEIT_NO_REPLY_DAYS);
}

/** Engine `CoveragePeriod`: a feeder's covered UTC days, both ends inclusive. */
export interface CoveragePeriod {
  from: string;
  to?: string;
}

/** Engine `isDayCovered`. */
export function isDayCovered(periods: readonly CoveragePeriod[], day: string): boolean {
  return periods.some((p) => day >= p.from && (p.to === undefined || day <= p.to));
}

/** Engine `closePeriod`: ends the open period the day before `effectiveDay`. */
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

/** Engine `reopenPeriod`: a rejoin. Throws if a period is open or would overlap. */
export function reopenPeriod(periods: readonly CoveragePeriod[], day: string): CoveragePeriod[] {
  for (const p of periods) {
    if (p.to === undefined) throw new Error('a coverage period is still open');
    if (day <= p.to) throw new Error('a new coverage period cannot overlap an earlier one');
  }
  return [...periods, { from: day }];
}

// --- Feeder ledger health (#4509) --------------------------------------------

const DAY_MS = 86_400_000;

/** Engine `FEEDER_DISCONNECT_DAYS`. */
export const FEEDER_DISCONNECT_DAYS = 30;

/** Engine `FeederHealth`. */
export interface FeederHealth {
  status: 'active' | 'disconnected';
  lastReadWellAt?: string;
  staleSince?: string;
}

/** Engine `FeederReadOutcome`. */
export type FeederReadOutcome = 'ok' | 'stale' | 'none';

/** Engine `advanceFeederHealth`. */
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

/** Engine `disconnectedCoverage` (with `lastBillableDate` inlined for a read that is its own clock). */
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

// --- Feeder accrual and running balance (#4510) -------------------------------

/** Engine `OwnerRateEntry`. */
export interface OwnerRateEntry {
  kind: 'requested' | 'agreed';
  pct: number;
  effectiveFrom: string;
  recordedAt: string;
}

function latestOwnerRate(
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

/** Engine `effectiveOwnerRate`, pct only: the agreed rate on `date` if any, else the requested. */
export function effectiveOwnerRatePct(
  history: readonly OwnerRateEntry[],
  date: string
): number | undefined {
  return (latestOwnerRate(history, 'agreed', date) ?? latestOwnerRate(history, 'requested', date))
    ?.pct;
}

/** Engine `FeederModeChange`. */
export interface FeederModeChange {
  from: string;
  mode: 'normal' | 'settled-otherwise';
}

/** Engine `FeederPayout`, the fields the balance reads. */
export interface FeederPayoutAmount {
  amount: number;
  notAPayout: boolean;
}

function isSettledOn(changes: readonly FeederModeChange[], day: string): boolean {
  let latest: FeederModeChange | undefined;
  for (const c of changes) if (c.from <= day && (!latest || c.from >= latest.from)) latest = c;
  return latest?.mode === 'settled-otherwise';
}

/** Engine `accrueValuedDays`. */
export function accrueValuedDays(
  days: readonly { date: string; value: number }[],
  rules: {
    coveragePeriods: readonly CoveragePeriod[];
    ownerRateHistory: readonly OwnerRateEntry[];
    modeChanges: readonly FeederModeChange[];
    isBillable: (day: string) => boolean;
  }
): { byDay: { date: string; value: number; pct: number; due: number }[]; accrued: number } {
  const byDay: { date: string; value: number; pct: number; due: number }[] = [];
  for (const { date, value } of [...days].sort((x, y) => x.date.localeCompare(y.date))) {
    if (!isDayCovered(rules.coveragePeriods, date) || !rules.isBillable(date)) continue;
    if (isSettledOn(rules.modeChanges, date)) continue;
    const pct = effectiveOwnerRatePct(rules.ownerRateHistory, date);
    if (pct === undefined) continue;
    byDay.push({ date, value, pct, due: (value * pct) / 100 });
  }
  return { byDay, accrued: byDay.reduce((sum, d) => sum + d.due, 0) };
}

/** Engine `feederBalance`. */
export function feederBalance(
  accrued: number,
  payouts: readonly FeederPayoutAmount[],
  settledOtherwise = false
) {
  const kindOf = (isk: number, balance: number): 'owed' | 'credit' | 'even' =>
    isk === 0 ? 'even' : balance > 0 ? 'owed' : 'credit';
  if (settledOtherwise) return { balance: 0, display: { kind: 'none' as const, isk: 0 } };
  const paid = payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);
  const balance = accrued - paid;
  const isk = Math.floor(Math.abs(balance));
  return { balance, display: { kind: kindOf(isk, balance), isk } };
}

/** Engine `onPayList`. */
export function onPayList(balance: { display: { kind: string } }): boolean {
  return balance.display.kind === 'owed';
}

/** The `payouts` subcollection document, Engine `FeederPayout`. Written only by callables. */
export interface FeederPayout extends FeederPayoutAmount {
  date: string;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
  journalRef?: number;
}

// --- Feeder view (#4512) -------------------------------------------------------

/** Engine `dayClosesAt`: the instant `date` stops taking late ore (end of the UTC day plus the grace). */
export function dayClosesAt(date: string, graceHours: number = BOOK_DEFAULTS.graceHours): string {
  return new Date(
    Date.parse(`${shiftDate(date, 1)}T00:00:00Z`) + graceHours * HOUR_MS
  ).toISOString();
}

/** Engine `oreFormTypeId`: the type a mined ore is valued as. */
export function oreFormTypeId(
  rawTypeId: number,
  compressedByRaw: Readonly<Record<string, number>>,
  compressed: boolean
): number {
  return compressed ? (compressedByRaw[String(rawTypeId)] ?? rawTypeId) : rawTypeId;
}

// --- Removing a moon owner (#4520); engine removal.ts ---------------------------

/** How long a removal waits once its mail is sent. */
export const REMOVAL_WAIT_MS = 24 * HOUR_MS;

/** Code-only: the payee-force guard looks back this far from the start of a removal. */
const PAYEE_LOOKBACK_MS = 48 * HOUR_MS;

/** A started removal. The clock (`effectiveAt`) is set when the mail is sent, never before. */
export interface Removal {
  startedAt: number;
  startedBy: number;
  startedByName: string;
  /** When the notice went out (the mail queue's send time, or the officer's confirmation). */
  noticeAt?: number;
  /** `noticeAt` plus 24 hours; absent until the notice is out. */
  effectiveAt?: number;
}

export type RemovableStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

export interface RemovalState {
  status: RemovableStatus;
  removal?: Removal;
}

/** A removal can start on an active moon owner only, and not twice. */
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

/** The notice went out: the 24 hours run from here. Idempotent: the first notice wins. */
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

/** Any Collector Accountant or higher (the caller checks the role); back to active. */
export function cancelRemoval(state: RemovalState): RemovalState {
  if (state.status !== 'pending-removal') throw new Error('no removal is pending');
  return { status: 'active' };
}

/** The wait is over. A removal whose notice never went out never takes effect on its own. */
export function isRemovalDue(state: RemovalState, now: number): boolean {
  const at = state.removal?.effectiveAt;
  return state.status === 'pending-removal' && at !== undefined && at <= now;
}

/** Engine `moonOwnerMailRecipients` (ownerRateMail.ts): CEO and payee, once each. */
export function moonOwnerMailRecipients(input: {
  ceoId: number | null;
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeCeoId?: number | null;
}): number[] {
  const payeeId = input.payee?.kind === 'character' ? input.payee.id : (input.payeeCeoId ?? null);
  return [...new Set([input.ceoId, payeeId].filter((id): id is number => typeof id === 'number'))];
}

/**
 * Whom the one mail goes to: the book's other officers, plus the moon owner's CEO and its
 * payee through the engine's shared `moonOwnerMailRecipients` (#4515). The officer who started it is
 * not mailed; nobody twice.
 */
export function removalRecipients(input: {
  officerIds: readonly number[];
  startedBy: number;
  ceoId: number | null;
  payee?: { kind: 'corporation' | 'character'; id: number };
  /** The payee corporation's CEO, when the payee is a corporation. */
  payeeCeoId?: number | null;
}): number[] {
  const out = new Set<number>();
  for (const id of input.officerIds) if (id !== input.startedBy) out.add(id);
  for (const id of moonOwnerMailRecipients(input)) out.add(id);
  return [...out];
}

/**
 * May the payee end a removal at once? Not when the payee was set or changed
 * within 48 hours before the removal started, or at any time after it started.
 * Exactly one rule, deliberately silent in every player-facing surface.
 */
export function payeeMayForce(input: {
  payeeChangedAt: number | undefined;
  removalStartedAt: number;
}): boolean {
  const { payeeChangedAt, removalStartedAt } = input;
  if (payeeChangedAt === undefined) return true;
  return payeeChangedAt < removalStartedAt - PAYEE_LOOKBACK_MS;
}

/**
 * Who may use the payee's link: the payee when it is a player, the corporation's
 * CEO when it is a corporation.
 */
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

/** A payee set or changed: the new payee and when. Re-saving the same payee changes nothing. */
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

// --- Payouts (#4514) -----------------------------------------------------------
// Engine `payouts.ts`: recording a payout and attaching the journal's outgoing donation to it.

/** A donation the accounting corporation's wallet sent. */
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

/** How far a recorded date may sit from the journal's day and still be the same payment. */
export const PAYOUT_LINK_WINDOW_DAYS = 3;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const payoutId = (d: Pick<OutgoingDonation, 'division' | 'refId'>) =>
  `j${d.division}_${d.refId}`;

const dayIndex = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** ISK the corporation's wallet donated to someone else (the amount is negative on the journal). */
export function outgoingDonationsFromJournal(
  entries: readonly JournalEntryOut[],
  division: number,
  corporationId: number
): OutgoingDonation[] {
  const out: OutgoingDonation[] = [];
  for (const e of entries) {
    if (e.ref_type !== 'player_donation') continue;
    if (!(typeof e.amount === 'number' && e.amount < 0)) continue;
    if (e.first_party_id !== corporationId || e.second_party_id === undefined) continue;
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

type StoredPayout = FeederPayout & { id: string };

export interface PayoutReconciliation {
  /** Journal entries that are the payment an officer already recorded. */
  attach: { id: string; journalRef: number }[];
  /** Donations nobody recorded: each becomes a payout. */
  create: { id: string; payout: FeederPayout }[];
}

/**
 * Attach each outgoing donation to the recorded payout with the same amount,
 * date (within the window) and recipient; a donation with no such record is
 * recorded as a payout. A journal entry that already counts (attached, or
 * marked "not a payout") is never counted again.
 */
export function reconcileOutgoing(input: {
  payouts: readonly StoredPayout[];
  outgoing: readonly OutgoingDonation[];
  /** The feeder's payee ids; only a donation to one of them counts. */
  payeeIds: ReadonlySet<number>;
  /** First covered day: older donations are never auto-recorded. */
  since: string;
}): PayoutReconciliation {
  const seen = new Set(
    input.payouts.flatMap((p) => (p.journalRef === undefined ? [] : [p.journalRef]))
  );
  const open = input.payouts.filter((p) => p.journalRef === undefined && !p.notAPayout);
  const taken = new Set<string>();
  const attach: PayoutReconciliation['attach'] = [];
  const create: PayoutReconciliation['create'] = [];
  const sorted = [...input.outgoing].sort((a, b) => a.at.localeCompare(b.at) || a.refId - b.refId);
  for (const d of sorted) {
    if (!input.payeeIds.has(d.recipientId) || seen.has(d.refId)) continue;
    seen.add(d.refId);
    const amount = Math.round(d.amount);
    const near = open
      .filter(
        (p) =>
          !taken.has(p.id) &&
          p.amount === amount &&
          Math.abs(dayIndex(p.date) - dayIndex(d.at)) <= PAYOUT_LINK_WINDOW_DAYS
      )
      .sort(
        (a, b) =>
          Math.abs(dayIndex(a.date) - dayIndex(d.at)) -
            Math.abs(dayIndex(b.date) - dayIndex(d.at)) || a.id.localeCompare(b.id)
      )[0];
    if (near) {
      taken.add(near.id);
      attach.push({ id: near.id, journalRef: d.refId });
      continue;
    }
    const date = d.at.slice(0, 10);
    if (date < input.since) continue;
    create.push({
      id: payoutId(d),
      payout: {
        date,
        amount,
        method: 'donation',
        status: 'matched',
        journalRef: d.refId,
        notAPayout: false,
      },
    });
  }
  return { attach, create };
}

/** A payout an officer says they sent ("I've sent it", or added by hand). A contract counts as other. */
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

/** The balance once `sent` ISK has gone out; credit when it is more than is owed. Whole ISK, rounded down. */
export function balanceAfter(
  balance: number,
  sent: number
): { kind: 'owed' | 'credit' | 'even' | 'none'; isk: number } {
  const left = balance - sent;
  const isk = Math.floor(Math.abs(left));
  return { kind: isk === 0 ? 'even' : left > 0 ? 'owed' : 'credit', isk };
}

/**
 * The days a payment covers: after the last payment, up to the last accrued
 * day. When nothing is newer than the last payment, every accrued day.
 */
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

/** The reason to paste into the in-game transfer. Never the miner rate or margin. */
export function payoutReason(prefix: string, period: { from: string; to: string } | undefined) {
  return period ? `${prefix}, ${period.from} to ${period.to}` : prefix;
}
