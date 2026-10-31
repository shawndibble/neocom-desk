/**
 * What the Overview and Miners tabs render, from either source (issue #5259, ADR 0032).
 *
 * - `fromBookView`: the figures `buildBookView` already decided from the whole book.
 * - `fromReadModels`: the same figures from the two server-built docs
 *   (`functions/src/corpTaxBookReadModels.ts`) plus the open set computed on read.
 *
 * The docs hold frozen inputs only. Time-derived values (overdue days, paused, standing,
 * the pops window, billable-through) and everything price-dependent (unbilled, pending,
 * unrated, an Extraction's estimate) are computed here from the clock and the loaded rows,
 * so a doc is never stale about them. `readModels.test.ts` proves the two paths agree.
 * Pure: no fetch, DOM or Dexie.
 */
import type { MinerListDoc, OverviewDoc } from '../../../functions/src/corpTaxBookReadModels';
import { DAY_MS } from '@/lib/age';
import { lastBillableDate } from './billable';
import { buildDayCharges, type DayCharge } from './charges';
import { splitByCoverageAndRead } from './feederHealth';
import { overdueStatus, type Declaration } from './overdue';
import { moonSchedule } from './bookSections';
import {
  extractionRowBase,
  latestCorporationOf,
  minerDraft,
  minerIdsOf,
  pendingTax,
  placeOfFactory,
  standingOf,
  type BookView,
  type BookViewInput,
  type ExtractionRow,
  type MinerRow,
  type NeedsYouItem,
} from './bookView';
import type { SettlePayment, SyncExtraction } from './sync';

/** The Extraction fields the Overview's schedule prints. */
export type ScheduleRow = Pick<
  ExtractionRow,
  'id' | 'structureId' | 'moonId' | 'state' | 'chunkArrivalAt' | 'expiresAt' | 'estimatedValue'
>;

export interface TabsProjection {
  miners: MinerRow[];
  totals: BookView['totals'];
  billableThrough: string | undefined;
  donationsBeforeBook: number;
  /** Days no rate covers yet: the Health strip's unrated warning. */
  unratedCount: number;
  needsYou: NeedsYouItem[];
  schedule: ReturnType<typeof moonSchedule<ScheduleRow>>;
}

const scheduleRow = (r: ScheduleRow): ScheduleRow => ({
  id: r.id,
  structureId: r.structureId,
  moonId: r.moonId,
  state: r.state,
  chunkArrivalAt: r.chunkArrivalAt,
  ...(r.expiresAt !== undefined ? { expiresAt: r.expiresAt } : {}),
  estimatedValue: r.estimatedValue,
});

function totalsOf(miners: readonly MinerRow[]): BookView['totals'] {
  const overdueRows = miners.filter((m) => m.overdueDays !== null);
  return {
    owed: miners.reduce((s, m) => s + m.owed, 0),
    overdue: overdueRows.reduce((s, m) => s + m.owed, 0),
    overdueCount: overdueRows.length,
    unbilled: miners.reduce((s, m) => s + m.unbilled, 0),
    credit: miners.reduce((s, m) => s + m.credit, 0),
  };
}

/** The old path: every figure from the whole-book view. */
export function fromBookView(view: BookView): TabsProjection {
  return {
    miners: view.miners,
    totals: view.totals,
    billableThrough: view.billableThrough,
    donationsBeforeBook: view.donationsBeforeBook,
    unratedCount: view.unrated.length,
    needsYou: view.needsYou,
    schedule: moonSchedule(view.extractions.map(scheduleRow), view.input.now),
  };
}

/** What the loaded rows decide, whatever the docs say: unbilled, pending and unrated days. */
export interface OpenSet {
  billableThrough: string | undefined;
  /** The Miner ids a view lists, in order. */
  minerIds: string[];
  byMiner: ReadonlyMap<string, { unbilled: number; pending: number }>;
  unratedCount: number;
}

/** The open set of `input`: the same day charges and drafts `buildBookView` builds, without the ledger. */
export function openSetOf(input: BookViewInput): OpenSet {
  const placeOf = placeOfFactory(input.extractions, input.structureExpiryHours);
  const { readable } = splitByCoverageAndRead(input.entries, {
    now: input.now,
    graceHours: input.graceHours,
    bookCorporationId: input.corporationId,
    feeders: input.feeders ?? [],
  });
  const { charges, unrated } = buildDayCharges(readable, {
    corporationId: input.corporationId,
    startDate: input.startDate,
    miners: input.miners,
    rates: input.rates,
    pricesOn: input.pricesOn,
    placeOf,
  });
  const billableThrough = lastBillableDate({
    now: input.now,
    lastSyncedAt: input.lastSyncedAt,
    graceHours: input.graceHours,
  });
  const minerIds = [...minerIdsOf(input, charges)];
  const byMiner = new Map<string, { unbilled: number; pending: number }>();
  for (const id of minerIds) {
    const statements = input.statements.filter((s) => s.minerId === id);
    const mine: DayCharge[] = charges.filter((c) => c.minerId === id);
    const draft = minerDraft(input, id, statements, mine, billableThrough);
    const billed = new Set<string>();
    for (const s of statements) for (const l of s.lines) if (l.chargeKey) billed.add(l.chargeKey);
    byMiner.set(id, {
      unbilled: (draft.kind === 'nothing' ? [] : draft.lines).reduce((sum, l) => sum + l.tax, 0),
      pending: pendingTax(input, mine, billed, billableThrough),
    });
  }
  return { billableThrough, minerIds, byMiner, unratedCount: unrated.length };
}

/** A doc that is missing, from another schema, or malformed is not used: the tab falls back. */
export function readModelsUsable(
  minerList: MinerListDoc | undefined,
  overview: OverviewDoc | undefined,
  schema: number
): minerList is MinerListDoc {
  return (
    minerList?.schema === schema &&
    Array.isArray(minerList.miners) &&
    overview?.schema === schema &&
    Array.isArray(overview.unmatchedPayments) &&
    Array.isArray(overview.extractions)
  );
}

/** The new path: frozen figures from the docs, time- and price-derived ones computed here. */
export function fromReadModels(
  docs: { minerList: MinerListDoc; overview: OverviewDoc },
  input: BookViewInput,
  open: OpenSet = openSetOf(input)
): TabsProjection {
  const entries = new Map(docs.minerList.miners.map((e) => [e.minerId, e]));
  const latestCorp = latestCorporationOf(input.entries);
  const nowMs = Date.parse(input.now);
  const miners: MinerRow[] = [];
  const needsYou: NeedsYouItem[] = [];

  for (const id of open.minerIds) {
    const grouping = input.miners.find((m) => m.id === id);
    const solo = /^solo:(\d+)$/.exec(id);
    const characterIds = grouping?.characterIds ?? (solo ? [Number(solo[1])] : []);
    const mainCharacterId = grouping?.mainCharacterId ?? characterIds[0] ?? 0;
    const entry = entries.get(id);
    const owed = entry?.owed ?? 0;

    let overdueDays: number | null = null;
    let overdueStatementId: string | undefined;
    let paused = false;
    for (const s of entry?.unsettled ?? []) {
      const status = overdueStatus({
        issuedAt: s.issuedAt,
        settled: false,
        now: input.now,
        declarations: s.declarations as unknown as Declaration[],
        overdueDays: input.overdueDays,
      });
      if (status.state === 'paused') paused = true;
      if (status.state === 'overdue') {
        const days = Math.max(1, Math.floor((nowMs - Date.parse(status.overdueAt)) / DAY_MS));
        if (overdueDays === null || days > overdueDays) {
          overdueDays = days;
          overdueStatementId = s.id;
        }
      }
    }
    const standing = standingOf(characterIds, latestCorp, input);
    const amounts = open.byMiner.get(id);
    miners.push({
      id,
      mainCharacterId,
      characterIds,
      standing,
      owed,
      overdueDays,
      unbilled: amounts?.unbilled ?? 0,
      pending: amounts?.pending ?? 0,
      credit: entry?.credit ?? 0,
      lastPaidAt: entry?.lastPaidAt ?? null,
      paused,
    });

    for (const d of entry?.unresolvedDeclarations ?? [])
      needsYou.push({
        kind: 'declaration',
        declaration: d as unknown as Declaration,
        minerId: id,
        owed,
      });
    if (overdueDays !== null && overdueStatementId && standing !== 'left')
      needsYou.push({
        kind: 'overdue',
        minerId: id,
        days: overdueDays,
        owed,
        statementId: overdueStatementId,
      });
    if (standing === 'left' && owed > 0)
      needsYou.push({ kind: 'leaver', minerId: id, owed, statementId: entry?.unsettled[0]?.id });
  }
  for (const p of docs.overview.unmatchedPayments)
    needsYou.push({ kind: 'unmatched', payment: p as unknown as SettlePayment });
  // The same ordering the cards read in: declarations, then the oldest debt.
  const rank: Record<NeedsYouItem['kind'], number> = {
    declaration: 0,
    overdue: 1,
    unmatched: 2,
    leaver: 3,
  };
  needsYou.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.kind === 'overdue' && b.kind === 'overdue' ? b.days - a.days : 0)
  );

  const todayPrices = input.pricesOn(input.now.slice(0, 10)).prices;
  const rows = (docs.overview.extractions as unknown as SyncExtraction[]).map((x) =>
    scheduleRow(extractionRowBase(x, input, todayPrices, new Map()))
  );
  return {
    miners,
    totals: totalsOf(miners),
    billableThrough: open.billableThrough,
    donationsBeforeBook: docs.overview.donationsBeforeBook,
    unratedCount: open.unratedCount,
    needsYou,
    schedule: moonSchedule(rows, input.now),
  };
}

/** The docs the screens read, as stored; either may be missing before the server has written them. */
export interface ReadModelDocs {
  minerList?: MinerListDoc;
  overview?: OverviewDoc;
}

/**
 * The projection a tab renders: the docs', unless they are missing or from another schema
 * (the server has not built or deployed them yet). Then the whole-book view still answers.
 */
export function tabsProjection(
  view: BookView,
  docs: ReadModelDocs | undefined,
  schema: number
): TabsProjection {
  if (docs && readModelsUsable(docs.minerList, docs.overview, schema))
    return fromReadModels({ minerList: docs.minerList, overview: docs.overview! }, view.input);
  return fromBookView(view);
}
