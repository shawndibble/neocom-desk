import { computeAssignmentValue } from '../miningTax/valuation';
import { dayClosesAt } from './billable';
import { isDayCovered, type CoveragePeriod } from './coverage';
import {
  accrueFeeder,
  feederBalance,
  isSettledOn,
  type BalanceDisplay,
  type FeederModeChange,
  type FeederPayout,
} from './feederAccrual';
import { payoutPeriod } from './payouts';
import { effectiveOwnerRate, type OwnerRateEntry } from './ownerRate';
import { resolveRate, type TaxRate } from './rates';
import type { ObservedMiningEntry } from './types';

/**
 * The accounting corporation's side of its moon owners (feeders): one row per
 * corporation for the Moon owners tab, one detail for its page. Pure; the
 * accrual is the engine's (`accrueFeeder`) and mirrors what the server writes
 * into the moon owner's own view, so both sides show the same figure.
 */

export type MoonOwnerPayout = FeederPayout & { id: string };

/** What the tab reads of a feeder record (`BookFeeder` fits). */
export interface MoonOwnerFeeder {
  corporationId: number;
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: 'normal' | 'settled-otherwise';
  note?: string;
  joinedAt: number;
  leftAt?: number;
  /** ISO instant of the last good ledger read. */
  lastReadWellAt?: string;
  /** When ESI first refused the ledger in the current spell (ms). */
  staleSince?: number;
  requestedRatePct?: number;
  agreedRatePct?: number;
  offeredOwnerRatePct?: number;
  /** Who a payment goes to: a corporation or a player. Absent: the moon owner itself. */
  payee?: { kind: 'corporation' | 'character'; id: number };
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
  coveragePeriods: CoveragePeriod[];
  payouts: readonly MoonOwnerPayout[];
}

export type MoonOwnerStatus =
  | 'active'
  | 'cant-read'
  | 'removal-pending'
  | 'settled-otherwise'
  | 'no-rate'
  | 'disconnected'
  | 'left'
  | 'removed';

export interface MoonOwnersInput {
  /** ISO instant the tab is read at. */
  now: string;
  graceHours: number;
  bookCorporationId: number;
  rates: readonly TaxRate[];
  /** Observed rows grouped into entries, every refinery the book reads. */
  entries: readonly ObservedMiningEntry[];
  feeders: readonly MoonOwnerFeeder[];
  /** The day's unit prices, by raw type id. */
  pricesOn: (date: string) => ReadonlyMap<number, number>;
}

export interface MoonOwnerRow {
  /** The moon owner's corporation id, as a path segment. */
  id: string;
  corporationId: number;
  status: MoonOwnerStatus;
  refineryCount: number;
  /** Ore value at 100% over their covered days. */
  mined: number;
  /** First covered day. */
  since?: string;
  /** Last day read: the day the ledger went stale, or where coverage ended. */
  until?: string;
  /** The effective owner rate today; absent when none is set. */
  theirRatePct?: number;
  /** What miners pay at their refineries. */
  minerRatePct?: number;
  /** Whole ISK still owed to them; 0 when nothing is. */
  owed: number;
  balance: BalanceDisplay;
  lastReadWellAt?: string;
  staleSince?: number;
  mode: 'normal' | 'settled-otherwise';
}

/** Whether a row is on the pay list: whole ISK owed, on a normal (not settled otherwise) moon owner. */
export const canPayMoonOwner = (row: Pick<MoonOwnerRow, 'mode' | 'owed'>) =>
  row.mode === 'normal' && row.owed > 0;

export interface MoonOwnerTotals {
  owed: number;
  paidThisMonth: number;
  count: number;
  needALook: number;
}

/** The record's rate history, or entries derived from its two rate fields (dated the join day). Mirrors `functions/`. */
export function deriveOwnerRateHistory(record: MoonOwnerFeeder): OwnerRateEntry[] {
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

/** The record's mode switches, or settled-otherwise from the join day when only `mode` says so. */
export function deriveModeChanges(record: MoonOwnerFeeder): FeederModeChange[] {
  if (record.modeChanges) return record.modeChanges;
  return record.mode === 'settled-otherwise'
    ? [{ from: new Date(record.joinedAt).toISOString().slice(0, 10), mode: 'settled-otherwise' }]
    : [];
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const paidOf = (payouts: readonly MoonOwnerPayout[]) =>
  payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);

const LIFECYCLE: readonly MoonOwnerFeeder['status'][] = ['disconnected', 'left', 'removed'];

function statusOf(f: MoonOwnerFeeder, settledNow: boolean, ratePct: number | undefined) {
  if (f.status === 'pending-removal') return 'removal-pending';
  if (LIFECYCLE.includes(f.status)) return f.status as 'disconnected' | 'left' | 'removed';
  if (f.staleSince !== undefined) return 'cant-read';
  if (settledNow) return 'settled-otherwise';
  if (ratePct === undefined) return 'no-rate';
  return 'active';
}

interface Worked {
  row: MoonOwnerRow;
  accrued: number;
  /** The days that accrued, for the payment's reason. */
  accruedDays: { date: string }[];
  covered: ObservedMiningEntry[];
}

function work(input: MoonOwnersInput, f: MoonOwnerFeeder): Worked {
  const today = input.now.slice(0, 10);
  const history = deriveOwnerRateHistory(f);
  const modeChanges = deriveModeChanges(f);
  const lastRead = f.lastReadWellAt === undefined ? undefined : Date.parse(f.lastReadWellAt);
  const isBillable = (day: string) =>
    lastRead !== undefined && lastRead >= Date.parse(dayClosesAt(day, input.graceHours));
  const own = input.entries.filter((e) => e.sourceCorporationId === f.corporationId);
  const covered = own.filter((e) => isDayCovered(f.coveragePeriods, e.date));
  const { accrued, byDay } = accrueFeeder({
    feederCorporationId: f.corporationId,
    entries: covered,
    coveragePeriods: f.coveragePeriods,
    ownerRateHistory: history,
    modeChanges,
    isBillable,
    pricesOn: input.pricesOn,
  });
  const settledNow = isSettledOn(modeChanges, today);
  const rate = effectiveOwnerRate(history, today);
  const { display } = feederBalance(accrued, f.payouts, settledNow);
  const mined = covered.reduce(
    (sum, e) =>
      sum + computeAssignmentValue(e.oreLines, input.pricesOn(e.date), 100).estimatedValue,
    0
  );
  const froms = f.coveragePeriods.map((p) => p.from).sort();
  const open = f.coveragePeriods.some((p) => p.to === undefined);
  const lastTo = f.coveragePeriods
    .flatMap((p) => (p.to === undefined ? [] : [p.to]))
    .sort()
    .at(-1);
  const until = f.staleSince !== undefined ? utcDay(f.staleSince) : open ? undefined : lastTo;
  const minerRate = resolveRate(input.rates, {
    date: today,
    minerId: '',
    moonId: undefined,
    recordKey: '',
    feederId: f.corporationId,
    isGuest: false,
  });
  return {
    accrued,
    accruedDays: byDay,
    covered,
    row: {
      id: String(f.corporationId),
      corporationId: f.corporationId,
      status: statusOf(f, settledNow, rate?.pct),
      refineryCount: new Set(own.map((e) => e.structureId)).size,
      mined,
      ...(froms[0] !== undefined ? { since: froms[0] } : {}),
      ...(until !== undefined ? { until } : {}),
      ...(rate ? { theirRatePct: rate.pct } : {}),
      ...(minerRate ? { minerRatePct: minerRate.pct } : {}),
      owed: display.kind === 'owed' ? display.isk : 0,
      balance: display,
      ...(f.lastReadWellAt !== undefined ? { lastReadWellAt: f.lastReadWellAt } : {}),
      ...(f.staleSince !== undefined ? { staleSince: f.staleSince } : {}),
      mode: settledNow ? 'settled-otherwise' : 'normal',
    },
  };
}

/** A moon owner who left or was removed stays listed only while it is still owed. */
const listed = (row: MoonOwnerRow) =>
  (row.status !== 'left' && row.status !== 'removed') || row.owed > 0;

const NEEDS_A_LOOK: readonly MoonOwnerStatus[] = [
  'cant-read',
  'removal-pending',
  'no-rate',
  'disconnected',
];

export function buildMoonOwners(input: MoonOwnersInput): {
  rows: MoonOwnerRow[];
  totals: MoonOwnerTotals;
} {
  const rows = input.feeders.map((f) => work(input, f).row).filter(listed);
  const month = input.now.slice(0, 7);
  const paidThisMonth = input.feeders.reduce(
    (sum, f) =>
      sum +
      f.payouts.reduce(
        (s, p) => (!p.notAPayout && p.date.slice(0, 7) === month ? s + p.amount : s),
        0
      ),
    0
  );
  return {
    rows,
    totals: {
      owed: rows.reduce((sum, r) => sum + r.owed, 0),
      paidThisMonth,
      count: rows.length,
      needALook: rows.filter((r) => NEEDS_A_LOOK.includes(r.status)).length,
    },
  };
}

export interface MoonOwnerMinedLine {
  characterId: number;
  structureId: number;
  /** Ore types mined, most first. */
  oreTypeIds: number[];
  quantity: number;
  /** At 100%. */
  value: number;
}

export interface MoonOwnerDetail {
  row: MoonOwnerRow;
  note?: string;
  joinedAt: number;
  offeredOwnerRatePct?: number;
  /** The rate they asked for, when they asked. */
  requestedRatePct?: number;
  /** Newest first. */
  history: OwnerRateEntry[];
  /** Newest first. */
  payouts: MoonOwnerPayout[];
  accrued: number;
  paid: number;
  mined: MoonOwnerMinedLine[];
  /** Who a payment goes to. */
  payee: { kind: 'corporation' | 'character'; id: number };
  /** The days a payment now covers, for its reason; absent when nothing accrued. */
  period?: { from: string; to: string };
}

export function moonOwnerDetail(input: MoonOwnersInput, id: number): MoonOwnerDetail | undefined {
  const f = input.feeders.find((x) => x.corporationId === id);
  if (!f) return undefined;
  const { row, accrued, accruedDays, covered } = work(input, f);
  const period = payoutPeriod(accruedDays, f.payouts);
  const history = deriveOwnerRateHistory(f);
  const today = input.now.slice(0, 10);
  const requested = [...history]
    .filter((h) => h.kind === 'requested' && h.effectiveFrom <= today)
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.recordedAt.localeCompare(a.recordedAt)
    )[0];

  const groups = new Map<string, MoonOwnerMinedLine & { byType: Map<number, number> }>();
  for (const e of covered) {
    const key = `${e.characterId}:${e.structureId}`;
    const g = groups.get(key) ?? {
      characterId: e.characterId,
      structureId: e.structureId,
      oreTypeIds: [],
      quantity: 0,
      value: 0,
      byType: new Map<number, number>(),
    };
    for (const l of e.oreLines) {
      g.quantity += l.quantity;
      g.byType.set(l.typeId, (g.byType.get(l.typeId) ?? 0) + l.quantity);
    }
    g.value += computeAssignmentValue(e.oreLines, input.pricesOn(e.date), 100).estimatedValue;
    groups.set(key, g);
  }
  const mined = [...groups.values()]
    .map(({ byType, ...g }) => ({
      ...g,
      oreTypeIds: [...byType].sort((a, b) => b[1] - a[1]).map(([typeId]) => typeId),
    }))
    .sort((a, b) => b.value - a.value || a.characterId - b.characterId);

  return {
    row,
    ...(f.note !== undefined ? { note: f.note } : {}),
    joinedAt: f.joinedAt,
    ...(f.offeredOwnerRatePct !== undefined ? { offeredOwnerRatePct: f.offeredOwnerRatePct } : {}),
    ...(requested ? { requestedRatePct: requested.pct } : {}),
    history: [...history].sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.recordedAt.localeCompare(a.recordedAt)
    ),
    payouts: [...f.payouts].sort((a, b) => b.date.localeCompare(a.date)),
    accrued,
    paid: paidOf(f.payouts),
    mined,
    payee: f.payee ?? { kind: 'corporation', id: f.corporationId },
    ...(period ? { period } : {}),
  };
}

/**
 * Whether the book reads any refinery of its own: an extraction notice, or a
 * ledger row no moon owner recorded. A moon owner's grant is ledger-only, so a
 * book with neither has nothing for the Extractions tab to show.
 */
export function hasOwnRefineries(
  entries: readonly Pick<ObservedMiningEntry, 'sourceCorporationId'>[],
  extractionCount: number,
  bookCorporationId: number
): boolean {
  return (
    extractionCount > 0 ||
    entries.some(
      (e) => e.sourceCorporationId === undefined || e.sourceCorporationId === bookCorporationId
    )
  );
}
