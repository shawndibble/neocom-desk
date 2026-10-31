import { computeAssignmentValue } from '../miningTax/valuation';
import { isDayCovered, type CoveragePeriod } from './coverage';
import {
  accrueValuedDays,
  deriveModeChanges,
  deriveOwnerRateHistory,
  feederBalance,
  feederBillableRule,
  isSettledOn,
  type BalanceDisplay,
  type FeederMode,
  type FeederModeChange,
  type FeederPayout,
} from './feederAccrual';
import { payeeOf, payoutPeriod, type Payee } from './payouts';
import { effectiveOwnerRate, type OwnerRateEntry } from './ownerRate';
import { resolveRate, type TaxRate } from './rates';
import type { ObservedMiningEntry } from './types';
import { utcDay } from '@/engine/localDay';

/**
 * The accounting corporation's side of its moon owners (feeders): one row per
 * corporation for the Moon owners tab, one detail for its page. Pure; the
 * accrual is the engine's (`accrueValuedDays`) and mirrors what the server writes
 * into the moon owner's own view, so both sides show the same figure.
 */

export type MoonOwnerPayout = FeederPayout & { id: string };

/** What the tab reads of a feeder record (`BookFeeder` fits). */
export interface MoonOwnerFeeder {
  corporationId: number;
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: FeederMode;
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
  payee?: Payee;
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
  coveragePeriods: CoveragePeriod[];
  /** A pending removal (#4520); `effectiveAt` is set once its notice is out. */
  removal?: { startedAt: number; startedByName: string; effectiveAt?: number };
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

/**
 * What the Moon owners tab reads of a moon owner's server-built view summary
 * (`corps/{book}/feederViews/{feeder}`, `FeederViewSummary` fits): one doc per moon owner in
 * place of every ledger row it recorded (ADR 0032, issue #5717).
 */
export interface MoonOwnerSummary {
  schemaVersion: number;
  status: MoonOwnerFeeder['status'];
  builtAt: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  lastReadWellAt: number | null;
  rateHistory: readonly Pick<OwnerRateEntry, 'kind' | 'pct' | 'effectiveFrom'>[];
  /** Ore value at 100% over the covered days. */
  minedValueIsk: number;
  accruedIsk: number;
  paidIsk: number;
  balanceKind: BalanceDisplay['kind'];
  balanceIsk: number;
  refineryCount: number;
  /** Covered, billable days the server could not price; the entry path prices them again. */
  unpricedDays: number;
}

export interface MoonOwnersInput {
  /** ISO instant the tab is read at. */
  now: string;
  graceHours: number;
  bookCorporationId: number;
  rates: readonly TaxRate[];
  /**
   * Observed rows grouped into entries, every refinery the book reads. A moon owner with a
   * current summary needs none of them (see `summaryFor`).
   */
  entries: readonly ObservedMiningEntry[];
  feeders: readonly MoonOwnerFeeder[];
  /** Each moon owner's view summary, by corporation id; absent where it was not read. */
  summaries?: ReadonlyMap<number, MoonOwnerSummary>;
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
  mode: FeederMode;
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

export { deriveModeChanges, deriveOwnerRateHistory };

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

/**
 * What miners pay at a moon owner's refineries today, resolved per entry the way billing does
 * (`buildDayCharges`): Guest when recorded outside the book's corporation, by refinery and moon.
 * When it varies, the rate most of their entries take (the higher on a tie). No ore yet: Guests.
 */
function minerRateAt(
  input: MoonOwnersInput,
  feederId: number,
  own: readonly ObservedMiningEntry[],
  today: string
): { pct: number } | undefined {
  const base = { date: today, minerId: '', recordKey: '', feederId };
  if (own.length === 0)
    return resolveRate(input.rates, { ...base, moonId: undefined, isGuest: true });
  const counts = new Map<number, number>();
  for (const e of own) {
    const rate = resolveRate(input.rates, {
      ...base,
      moonId: e.moonId,
      structureId: e.structureId,
      isGuest: e.recordedCorporationId !== input.bookCorporationId,
    });
    if (rate) counts.set(rate.pct, (counts.get(rate.pct) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return top && { pct: top[0] };
}

/** A rate history as one comparable string: kind, rate and day, in day order. */
const historyKey = (h: readonly Pick<OwnerRateEntry, 'kind' | 'pct' | 'effectiveFrom'>[]) =>
  h
    .map((e) => `${e.kind}|${e.pct}|${e.effectiveFrom}`)
    .sort()
    .join(';');

/**
 * The moon owner's summary when it still says what the record says, else undefined and the
 * entries are priced instead. The server rebuilds a view on a ledger read, a payout, a payee
 * change, a leave or removal and a dismissal, but not when an officer sets a rate or mode, and a
 * day it could not price is priced later: any of those leaves a summary behind the record, so
 * the figures here must not come from it. Nothing is read to check: the record is already held.
 */
export function summaryFor(
  input: MoonOwnersInput,
  f: MoonOwnerFeeder
): MoonOwnerSummary | undefined {
  const s = input.summaries?.get(f.corporationId);
  if (!s || s.schemaVersion !== 1 || s.unpricedDays > 0 || s.status !== f.status) return undefined;
  const today = input.now.slice(0, 10);
  const modes = deriveModeChanges(f);
  // The summary carries only today's mode and the outer coverage bounds: a closed settled window
  // or an interior coverage period could have moved without a rebuild and cannot be told apart.
  if (modes.length > 1 || modes[0]?.mode === 'normal' || f.coveragePeriods.length > 2)
    return undefined;
  const settledNow = isSettledOn(modes, today);
  if ((s.balanceKind === 'none') !== settledNow) return undefined;
  const read = f.lastReadWellAt === undefined ? null : Date.parse(f.lastReadWellAt);
  if (s.lastReadWellAt !== read) return undefined;
  if (s.paidIsk !== paidOf(f.payouts)) return undefined;
  if (historyKey(s.rateHistory) !== historyKey(deriveOwnerRateHistory(f))) return undefined;
  const periods = [...f.coveragePeriods].sort((a, b) => a.from.localeCompare(b.from));
  if (s.coverageFrom !== (periods[0]?.from ?? null)) return undefined;
  if (s.coverageTo !== (periods.at(-1)?.to ?? null)) return undefined;
  return s;
}

/**
 * What miners pay at a moon owner's refineries, with no entry to ask. Exact when no rate depends
 * on the entry (a Guest, per-refinery or per-moon rate does): then it is the rate every entry
 * resolves to. Otherwise undefined, and the caller reads the entries if it holds any.
 */
function minerRateWithoutEntries(
  input: MoonOwnersInput,
  feederId: number,
  today: string,
  noRows: boolean
): { pct: number } | undefined | 'depends' {
  const base = { date: today, minerId: '', recordKey: '', feederId, moonId: undefined };
  // The entry path prices a moon owner with no ore yet as Guests.
  if (noRows) return resolveRate(input.rates, { ...base, isGuest: true });
  if (input.rates.some((r) => r.scope === 'guest' || r.scope === 'structure' || r.scope === 'moon'))
    return 'depends';
  return resolveRate(input.rates, { ...base, isGuest: false });
}

/** A moon owner's row from its summary: the figures the server already worked out from its rows. */
function workFromSummary(
  input: MoonOwnersInput,
  f: MoonOwnerFeeder,
  s: MoonOwnerSummary,
  entries: () => readonly ObservedMiningEntry[]
): MoonOwnerRow {
  const today = input.now.slice(0, 10);
  const settledNow = isSettledOn(deriveModeChanges(f), today);
  const rate = effectiveOwnerRate(deriveOwnerRateHistory(f), today);
  const display: BalanceDisplay = { kind: s.balanceKind, isk: s.balanceIsk };
  const froms = f.coveragePeriods.map((p) => p.from).sort();
  const open = f.coveragePeriods.some((p) => p.to === undefined);
  const lastTo = f.coveragePeriods
    .flatMap((p) => (p.to === undefined ? [] : [p.to]))
    .sort()
    .at(-1);
  const until = f.staleSince !== undefined ? utcDay(f.staleSince) : open ? undefined : lastTo;
  const rated = minerRateWithoutEntries(input, f.corporationId, today, s.refineryCount === 0);
  // The entries are held only until the page stops reading them; none held is not "no ore yet".
  const own = rated === 'depends' ? entries() : [];
  const minerRate =
    rated === 'depends'
      ? own.length > 0
        ? minerRateAt(input, f.corporationId, own, today)
        : undefined
      : rated;
  return {
    id: String(f.corporationId),
    corporationId: f.corporationId,
    status: statusOf(f, settledNow, rate?.pct),
    refineryCount: s.refineryCount,
    mined: s.minedValueIsk,
    ...(froms[0] !== undefined ? { since: froms[0] } : {}),
    ...(until !== undefined ? { until } : {}),
    ...(rate ? { theirRatePct: rate.pct } : {}),
    ...(minerRate ? { minerRatePct: minerRate.pct } : {}),
    owed: display.kind === 'owed' ? display.isk : 0,
    balance: display,
    ...(f.lastReadWellAt !== undefined ? { lastReadWellAt: f.lastReadWellAt } : {}),
    ...(f.staleSince !== undefined ? { staleSince: f.staleSince } : {}),
    mode: settledNow ? 'settled-otherwise' : 'normal',
  };
}

interface Worked {
  row: MoonOwnerRow;
  accrued: number;
  /** The days that accrued, for the payment's reason. */
  accruedDays: { date: string }[];
  covered: ObservedMiningEntry[];
  /** Each covered entry's value at 100%, by index into `covered`. */
  coveredValues: number[];
}

/** The book's entries by the moon owner whose refinery recorded them, in their order. */
function entriesBySource(entries: readonly ObservedMiningEntry[]) {
  const out = new Map<number | undefined, ObservedMiningEntry[]>();
  for (const e of entries) {
    const list = out.get(e.sourceCorporationId);
    if (list) list.push(e);
    else out.set(e.sourceCorporationId, [e]);
  }
  return out;
}

function work(
  input: MoonOwnersInput,
  f: MoonOwnerFeeder,
  own: readonly ObservedMiningEntry[]
): Worked {
  const today = input.now.slice(0, 10);
  const history = deriveOwnerRateHistory(f);
  const modeChanges = deriveModeChanges(f);
  const covered = own.filter((e) => isDayCovered(f.coveragePeriods, e.date));
  // Each entry priced once: the accrual, `mined` and the detail's lines share it.
  const coveredValues = covered.map(
    (e) => computeAssignmentValue(e.oreLines, input.pricesOn(e.date), 100).estimatedValue
  );
  const valueByDay = new Map<string, number>();
  covered.forEach((e, i) =>
    valueByDay.set(e.date, (valueByDay.get(e.date) ?? 0) + coveredValues[i]!)
  );
  const { accrued, byDay } = accrueValuedDays(
    [...valueByDay].map(([date, value]) => ({ date, value })),
    {
      coveragePeriods: f.coveragePeriods,
      ownerRateHistory: history,
      modeChanges,
      isBillable: feederBillableRule(
        f.lastReadWellAt === undefined ? undefined : Date.parse(f.lastReadWellAt),
        input.graceHours
      ),
    }
  );
  const settledNow = isSettledOn(modeChanges, today);
  const rate = effectiveOwnerRate(history, today);
  const { display } = feederBalance(accrued, f.payouts, settledNow);
  const mined = coveredValues.reduce((sum, v) => sum + v, 0);
  const froms = f.coveragePeriods.map((p) => p.from).sort();
  const open = f.coveragePeriods.some((p) => p.to === undefined);
  const lastTo = f.coveragePeriods
    .flatMap((p) => (p.to === undefined ? [] : [p.to]))
    .sort()
    .at(-1);
  const until = f.staleSince !== undefined ? utcDay(f.staleSince) : open ? undefined : lastTo;
  const minerRate = minerRateAt(input, f.corporationId, own, today);
  return {
    accrued,
    accruedDays: byDay,
    covered,
    coveredValues,
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

/**
 * Whether the Moon owners tab must have the ledger rows (#5717): a moon owner whose summary no
 * longer says what its record says (`summaryFor`), or whose miner rate depends on an entry
 * (`minerRateWithoutEntries`), is priced from rows. Anything else renders from the summaries,
 * and the tab never reads `observed`.
 */
export function moonOwnersNeedRows(input: Omit<MoonOwnersInput, 'entries' | 'pricesOn'>): boolean {
  const full: MoonOwnersInput = { ...input, entries: [], pricesOn: () => new Map() };
  const today = input.now.slice(0, 10);
  return input.feeders.some((f) => {
    const s = summaryFor(full, f);
    return (
      !s ||
      minerRateWithoutEntries(full, f.corporationId, today, s.refineryCount === 0) === 'depends'
    );
  });
}

export function buildMoonOwners(input: MoonOwnersInput): {
  rows: MoonOwnerRow[];
  totals: MoonOwnerTotals;
} {
  // Grouped only when a moon owner has no current summary (or its miner rate depends on entries).
  let bySource: ReturnType<typeof entriesBySource> | undefined;
  const entriesOf = (id: number) => (bySource ??= entriesBySource(input.entries)).get(id) ?? [];
  const rows = input.feeders
    .map((f) => {
      const summary = summaryFor(input, f);
      return summary
        ? workFromSummary(input, f, summary, () => entriesOf(f.corporationId))
        : work(input, f, entriesOf(f.corporationId)).row;
    })
    .filter(listed);
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
  hasPayee: boolean;
  removal?: { startedAt: number; startedByName: string; effectiveAt?: number };
  /** Who a payment goes to. */
  payee: Payee;
  /** The days a payment now covers, for its reason; absent when nothing accrued. */
  period?: { from: string; to: string };
}

export function moonOwnerDetail(input: MoonOwnersInput, id: number): MoonOwnerDetail | undefined {
  const f = input.feeders.find((x) => x.corporationId === id);
  if (!f) return undefined;
  const own = input.entries.filter((e) => e.sourceCorporationId === f.corporationId);
  const { row, accrued, accruedDays, covered, coveredValues } = work(input, f, own);
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
  covered.forEach((e, i) => {
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
    g.value += coveredValues[i]!;
    groups.set(key, g);
  });
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
    hasPayee: f.payee !== undefined,
    ...(f.status === 'pending-removal' && f.removal ? { removal: f.removal } : {}),
    payee: payeeOf(f),
    ...(period ? { period } : {}),
  };
}

/**
 * What `hasOwnRefineries` says without any ledger row, when the held records settle it: an
 * Extraction exists, or there are no moon owners (the tab is kept). `undefined`: only the rows
 * can tell (#5717).
 */
export function ownRefineriesFromStored(
  extractionCount: number,
  feederCount: number
): boolean | undefined {
  return extractionCount > 0 || feederCount === 0 ? true : undefined;
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
