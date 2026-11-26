import { computeAssignmentValue } from '../miningTax/valuation';
import { moonOwnerDayPrices } from './valuation';
import { isDayCovered, type CoveragePeriod } from './coverage';
import { daysUntilOreLost, staleLedgerClock } from './feederHealth';
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
import { effectiveOwnerRate, pendingRateRequest, type OwnerRateEntry } from './ownerRate';
import { resolveRate, type TaxRate } from './rates';
import type { ObservedMiningEntry } from './types';
import { utcDay } from '@/engine/localDay';
import type { RefineryMining } from './moonOwnerRefineries';

export type MoonOwnerPayout = FeederPayout & { id: string };

export interface MoonOwnerFeeder {
  corporationId: number;
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: FeederMode;
  sameOwner?: boolean;
  note?: string;
  joinedAt: number;
  leftAt?: number;
  lastReadWellAt?: string;
  staleSince?: number;
  requestedRatePct?: number;
  agreedRatePct?: number;
  offeredOwnerRatePct?: number;
  payee?: Payee;
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
  coveragePeriods: CoveragePeriod[];
  removal?: { startedAt: number; startedByName: string; effectiveAt?: number };
  readsStructureNames?: boolean;
  readsNotifications?: boolean;
  payouts: readonly MoonOwnerPayout[];
}

export type MoonOwnerStatus =
  | 'active'
  | 'cant-read'
  | 'removal-pending'
  | 'removal-unsent'
  | 'settled-otherwise'
  | 'rate-asked'
  | 'no-rate'
  | 'disconnected'
  | 'left'
  | 'removed';

export interface MoonOwnerSummary {
  schemaVersion: number;
  rulesVersion?: number;
  mode?: FeederMode;
  status: MoonOwnerFeeder['status'];
  builtAt: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  lastReadWellAt: number | null;
  rateHistory: readonly Pick<OwnerRateEntry, 'kind' | 'pct' | 'effectiveFrom'>[];
  minedValueIsk: number;
  accruedIsk: number;
  paidIsk: number;
  balanceKind: BalanceDisplay['kind'];
  balanceIsk: number;
  refineryCount: number;
  refineryIds?: readonly number[];
  unpricedDays: number;
}

export interface MoonOwnersInput {
  now: string;
  graceHours: number;
  bookCorporationId: number;
  rates: readonly TaxRate[];
  entries: readonly ObservedMiningEntry[];
  feeders: readonly MoonOwnerFeeder[];
  summaries?: ReadonlyMap<number, MoonOwnerSummary>;
  extractionRefineries?: ReadonlyMap<number, ReadonlySet<number>>;
  pricesOn: (date: string) => ReadonlyMap<number, number>;
  billedPrices?: ReadonlyMap<string, Readonly<Record<number, number>>>;
}

export function billedPricesOf(
  notices: readonly {
    lines: readonly { key: string; unitPrices?: Readonly<Record<number, number>> }[];
  }[]
): Map<string, Readonly<Record<number, number>>> {
  const out = new Map<string, Readonly<Record<number, number>>>();
  for (const n of notices)
    for (const line of n.lines)
      if (line.unitPrices && !out.has(line.key)) out.set(line.key, line.unitPrices);
  return out;
}

function entryPrices(input: MoonOwnersInput, e: ObservedMiningEntry): ReadonlyMap<number, number> {
  const day = input.pricesOn(e.date);
  const billed = input.billedPrices?.get(`${e.characterId}:${e.structureId}:${e.date}`);
  if (!billed) return day;
  return moonOwnerDayPrices(
    day,
    new Map(Object.entries(billed).map(([typeId, price]) => [Number(typeId), price]))
  );
}

export interface MoonOwnerRow {
  id: string;
  corporationId: number;
  status: MoonOwnerStatus;
  refineryCount: number;
  nothingSeen?: true;
  mined: number;
  since?: string;
  until?: string;
  theirRatePct?: number;
  askedRatePct?: number;
  minerRatePct?: number;
  owed: number;
  balance: BalanceDisplay;
  lastReadWellAt?: string;
  staleSince?: number;
  mode: FeederMode;
  sameOwner?: boolean;
  readsStructureNames?: boolean;
  readsNotifications?: boolean;
}

const grantReads = (f: MoonOwnerFeeder) => ({
  ...(f.readsStructureNames !== undefined ? { readsStructureNames: f.readsStructureNames } : {}),
  ...(f.readsNotifications !== undefined ? { readsNotifications: f.readsNotifications } : {}),
});

export const canPayMoonOwner = (row: Pick<MoonOwnerRow, 'owed'>) => row.owed > 0;

export interface MoonOwnerTotals {
  owed: number;
  paidThisMonth: number;
  count: number;
  needALook: number;
}

export { deriveModeChanges, deriveOwnerRateHistory };

export function extractionRefineriesOf(
  extractions: readonly { structureId: number; sourceCorporationId?: number }[]
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const x of extractions) {
    if (x.sourceCorporationId === undefined) continue;
    const held = out.get(x.sourceCorporationId);
    if (held) held.add(x.structureId);
    else out.set(x.sourceCorporationId, new Set([x.structureId]));
  }
  return out;
}

function refineriesSeen(
  input: MoonOwnersInput,
  feederId: number,
  ledger: Iterable<number>
): Pick<MoonOwnerRow, 'refineryCount' | 'nothingSeen'> {
  const all = new Set(ledger);
  for (const id of input.extractionRefineries?.get(feederId) ?? []) all.add(id);
  return seen(all.size);
}

const seen = (count: number): Pick<MoonOwnerRow, 'refineryCount' | 'nothingSeen'> => ({
  refineryCount: count,
  ...(count === 0 ? { nothingSeen: true as const } : {}),
});

function refineriesSeenInSummary(
  input: MoonOwnersInput,
  feederId: number,
  s: MoonOwnerSummary
): Pick<MoonOwnerRow, 'refineryCount' | 'nothingSeen'> {
  if (s.refineryIds) return refineriesSeen(input, feederId, s.refineryIds);
  return seen(Math.max(s.refineryCount, input.extractionRefineries?.get(feederId)?.size ?? 0));
}

const paidOf = (payouts: readonly MoonOwnerPayout[]) =>
  payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);

const LIFECYCLE: readonly MoonOwnerFeeder['status'][] = ['disconnected', 'left', 'removed'];

export function staleLedgerMailDue(
  row: Pick<MoonOwnerRow, 'status' | 'staleSince' | 'sameOwner' | 'lastReadWellAt'>,
  now: string
): boolean {
  return (
    row.staleSince !== undefined &&
    row.sameOwner !== true &&
    row.status !== 'left' &&
    row.status !== 'removed' &&
    daysUntilOreLost(staleLedgerClock(row.staleSince, row.lastReadWellAt), now) > 0
  );
}

export function isStillRead(status: MoonOwnerStatus): boolean {
  return !(LIFECYCLE as readonly string[]).includes(status);
}

function statusOf(
  f: MoonOwnerFeeder,
  settledNow: boolean,
  ratePct: number | undefined,
  askedPct: number | undefined
): MoonOwnerStatus {
  if (f.status === 'pending-removal')
    return f.removal && f.removal.effectiveAt === undefined ? 'removal-unsent' : 'removal-pending';
  if (LIFECYCLE.includes(f.status)) return f.status as 'disconnected' | 'left' | 'removed';
  if (f.staleSince !== undefined) return 'cant-read';
  if (settledNow) return 'settled-otherwise';
  if (askedPct !== undefined) return 'rate-asked';
  if (ratePct === undefined) return 'no-rate';
  return 'active';
}

function rateFields(f: MoonOwnerFeeder, settledNow: boolean, today: string) {
  const history = deriveOwnerRateHistory(f);
  const rate = effectiveOwnerRate(history, today);
  const asked = f.sameOwner ? undefined : pendingRateRequest(history);
  return {
    status: statusOf(f, settledNow, rate?.pct, asked),
    ...(rate ? { theirRatePct: rate.pct } : {}),
    ...(asked !== undefined ? { askedRatePct: asked } : {}),
  };
}

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
      minerCorporationId: e.recordedCorporationId,
    });
    if (rate) counts.set(rate.pct, (counts.get(rate.pct) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return top && { pct: top[0] };
}

const historyKey = (h: readonly Pick<OwnerRateEntry, 'kind' | 'pct' | 'effectiveFrom'>[]) =>
  h
    .map((e) => `${e.kind}|${e.pct}|${e.effectiveFrom}`)
    .sort()
    .join(';');

export const FEEDER_VIEW_RULES = 2;

export function summaryFor(
  input: MoonOwnersInput,
  f: MoonOwnerFeeder
): MoonOwnerSummary | undefined {
  const s = input.summaries?.get(f.corporationId);
  if (
    !s ||
    s.schemaVersion !== 1 ||
    s.rulesVersion !== FEEDER_VIEW_RULES ||
    s.unpricedDays > 0 ||
    s.status !== f.status
  )
    return undefined;
  const today = input.now.slice(0, 10);
  const modes = deriveModeChanges(f);
  if (modes.length > 1 || modes[0]?.mode === 'normal' || f.coveragePeriods.length > 2)
    return undefined;
  const settledNow = isSettledOn(modes, today);
  if (s.mode !== f.mode) return undefined;
  if (s.balanceKind === 'none' && !settledNow) return undefined;
  if (settledNow && s.balanceKind !== 'none' && s.balanceKind !== 'owed') return undefined;
  const read = f.lastReadWellAt === undefined ? null : Date.parse(f.lastReadWellAt);
  if (s.lastReadWellAt !== read) return undefined;
  if (s.paidIsk !== paidOf(f.payouts)) return undefined;
  if (historyKey(s.rateHistory) !== historyKey(deriveOwnerRateHistory(f))) return undefined;
  const periods = [...f.coveragePeriods].sort((a, b) => a.from.localeCompare(b.from));
  if (s.coverageFrom !== (periods[0]?.from ?? null)) return undefined;
  if (s.coverageTo !== (periods.at(-1)?.to ?? null)) return undefined;
  return s;
}

function minerRateWithoutEntries(
  input: MoonOwnersInput,
  feederId: number,
  today: string,
  noRows: boolean
): { pct: number } | undefined | 'depends' {
  const base = { date: today, minerId: '', recordKey: '', feederId, moonId: undefined };
  if (noRows) return resolveRate(input.rates, { ...base, isGuest: true });
  if (
    input.rates.some(
      (r) =>
        r.scope === 'guest' ||
        r.scope === 'structure' ||
        r.scope === 'moon' ||
        (r.scope === 'feeder-member' && r.feederId === feederId)
    )
  )
    return 'depends';
  return resolveRate(input.rates, { ...base, isGuest: false });
}

function workFromSummary(
  input: MoonOwnersInput,
  f: MoonOwnerFeeder,
  s: MoonOwnerSummary,
  entries: () => readonly ObservedMiningEntry[]
): MoonOwnerRow {
  const today = input.now.slice(0, 10);
  const settledNow = f.sameOwner === true || isSettledOn(deriveModeChanges(f), today);
  const display: BalanceDisplay = { kind: s.balanceKind, isk: s.balanceIsk };
  const froms = f.coveragePeriods.map((p) => p.from).sort();
  const open = f.coveragePeriods.some((p) => p.to === undefined);
  const lastTo = f.coveragePeriods
    .flatMap((p) => (p.to === undefined ? [] : [p.to]))
    .sort()
    .at(-1);
  const until = f.staleSince !== undefined ? utcDay(f.staleSince) : open ? undefined : lastTo;
  const rated = minerRateWithoutEntries(input, f.corporationId, today, s.refineryCount === 0);
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
    ...rateFields(f, settledNow, today),
    ...refineriesSeenInSummary(input, f.corporationId, s),
    mined: s.minedValueIsk,
    ...(froms[0] !== undefined ? { since: froms[0] } : {}),
    ...(until !== undefined ? { until } : {}),
    ...(minerRate ? { minerRatePct: minerRate.pct } : {}),
    owed: display.kind === 'owed' ? display.isk : 0,
    balance: display,
    ...(f.lastReadWellAt !== undefined ? { lastReadWellAt: f.lastReadWellAt } : {}),
    ...(f.staleSince !== undefined ? { staleSince: f.staleSince } : {}),
    mode: settledNow ? 'settled-otherwise' : 'normal',
    ...(f.sameOwner ? { sameOwner: true } : {}),
    ...grantReads(f),
  };
}

interface Worked {
  row: MoonOwnerRow;
  accrued: number;
  accruedDays: { date: string }[];
  covered: ObservedMiningEntry[];
  coveredValues: number[];
}

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
  const coveredValues = covered.map(
    (e) => computeAssignmentValue(e.oreLines, entryPrices(input, e), 100).estimatedValue
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
  const settledNow = f.sameOwner === true || isSettledOn(modeChanges, today);
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
      ...rateFields(f, settledNow, today),
      ...refineriesSeen(
        input,
        f.corporationId,
        own.map((e) => e.structureId)
      ),
      mined,
      ...(froms[0] !== undefined ? { since: froms[0] } : {}),
      ...(until !== undefined ? { until } : {}),
      ...(minerRate ? { minerRatePct: minerRate.pct } : {}),
      owed: display.kind === 'owed' ? display.isk : 0,
      balance: display,
      ...(f.lastReadWellAt !== undefined ? { lastReadWellAt: f.lastReadWellAt } : {}),
      ...(f.staleSince !== undefined ? { staleSince: f.staleSince } : {}),
      mode: settledNow ? 'settled-otherwise' : 'normal',
      ...(f.sameOwner ? { sameOwner: true } : {}),
      ...grantReads(f),
    },
  };
}

const listed = (row: MoonOwnerRow) =>
  (row.status !== 'left' && row.status !== 'removed') || row.owed > 0;

const NEEDS_A_LOOK: readonly MoonOwnerStatus[] = [
  'cant-read',
  'removal-pending',
  'removal-unsent',
  'rate-asked',
  'no-rate',
  'disconnected',
];

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
  oreTypeIds: number[];
  quantity: number;
  value: number;
}

export interface MoonOwnerDetail {
  row: MoonOwnerRow;
  note?: string;
  joinedAt: number;
  offeredOwnerRatePct?: number;
  requestedRatePct?: number;
  history: OwnerRateEntry[];
  payouts: MoonOwnerPayout[];
  accrued: number;
  paid: number;
  mined: MoonOwnerMinedLine[];
  hasPayee: boolean;
  removal?: { startedAt: number; startedByName: string; effectiveAt?: number };
  payee: Payee;
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

export function moonOwnerRefineryMining(
  input: MoonOwnersInput,
  id: number
): RefineryMining[] | undefined {
  const f = input.feeders.find((x) => x.corporationId === id);
  if (!f) return undefined;
  const own = input.entries.filter((e) => e.sourceCorporationId === f.corporationId);
  const { covered, coveredValues } = work(input, f, own);
  return covered.map((e, i) => ({
    structureId: e.structureId,
    characterId: e.characterId,
    date: e.date,
    quantity: e.oreLines.reduce((sum, l) => sum + l.quantity, 0),
    value: coveredValues[i]!,
  }));
}
