// The Overview and Miners tab read models (issue #5259, ADR 0032): two docs under
// `corps/{id}/readModels`, built from the book's frozen records. Shadow mode until the
// screens' switch flips (src/features/corp/taxBook/readModelSwitch.ts): nothing reads them
// while it is off.
//
// They hold inputs, never time-derived figures. Overdue days, paused, standing, the
// "Pops in 7 days" window, billable-through and the open set (unbilled, pending, unrated)
// are computed on read by src/engine/corpTaxBook/readModels.ts. Names are never stored.
//
// Pure and dependency-free: src/engine/corpTaxBook/readModels.test.ts imports it to prove
// the figures the tabs derive from these docs equal `buildBookView`'s.

import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  isBeforeBook,
  type MirrorExtraction,
} from './corpTaxBookEngine.js';
import { READ_MODELS_SCHEMA } from './corpTaxBookVersionKeys.js';
import { allocateMiner, minerIdsIn, type BookRecords } from './corpTaxBookMinerTotals.js';

export const READ_MODELS = 'readModels';
export const MINER_LIST_DOC = 'minerList';
export const OVERVIEW_DOC = 'overview';
export { READ_MODELS_SCHEMA };

type Data = Record<string, unknown>;

/** A Miner's frozen account, as the Miners tab and the Needs you queue read it. */
export interface MinerListEntry {
  minerId: string;
  /** What is still due on unsettled Statements (excludes credit). */
  owed: number;
  credit: number;
  /** ISO instant of the latest payment that was tax; null when none. */
  lastPaidAt: string | null;
  /** Unsettled Statements, in the Statements' stored order, each with its declarations. */
  unsettled: { id: string; issuedAt: string; declarations: Data[] }[];
  /** Declarations nobody resolved yet, on any of the Miner's Statements. */
  unresolvedDeclarations: Data[];
}

export interface MinerListDoc {
  schema: number;
  miners: MinerListEntry[];
}

export interface OverviewDoc {
  schema: number;
  /** Donations dated before the book's start date: counted, never credited or listed. */
  donationsBeforeBook: number;
  /** Payments no Miner claimed, in the payments' stored order. */
  unmatchedPayments: Data[];
  /**
   * The rolling window of Extractions: those not cancelled and not expired more than a day
   * before the doc was built. State is computed on read.
   */
  extractions: Data[];
}

export interface ReadModels {
  [MINER_LIST_DOC]: MinerListDoc;
  [OVERVIEW_DOC]: OverviewDoc;
}

const DAY_MS = 86_400_000;

/** Whether an Extraction is still worth listing at `now` (ms): not cancelled, expiry no more than a day gone. */
function inWindow(
  x: MirrorExtraction,
  expiryHours: Readonly<Record<string, number>>,
  now: number
): boolean {
  if (x.cancelledAt) return false;
  const fractured = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
  if (Number.isNaN(fractured)) return true;
  const hours = Math.min(
    expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
    MAX_EXPIRY_HOURS
  );
  return fractured + hours * 3_600_000 >= now - DAY_MS;
}

/** Builds both docs from every record of a book. `now` is epoch ms. */
export function buildReadModels(records: BookRecords, now: number): ReadModels {
  const entries: MinerListEntry[] = [];
  for (const minerId of [...minerIdsIn(records)].sort()) {
    const mine = {
      minerId,
      miner: records.miners.find((m) => m.id === minerId),
      statements: records.statements.filter((s) => s.minerId === minerId),
      payments: records.payments.filter((p) => p.minerId === minerId),
      writeOffs: records.writeOffs.filter((w) => w.minerId === minerId),
    };
    const { statements, payments, allocation } = allocateMiner(mine, records);
    // A donation before the book is neither credited nor shown as a payment.
    const counted = payments.filter(
      (p) => p.source !== 'donation' || !records.startDate || !isBeforeBook(p.at, records.startDate)
    );
    let lastPaidAt: string | null = null;
    for (const p of counted)
      if (p.amount - (p.notTaxAmount ?? 0) > 0 && (lastPaidAt === null || p.at > lastPaidAt))
        lastPaidAt = p.at;
    // The allocation's own order, so the float sum equals the client's.
    let owed = 0;
    for (const settlement of allocation.byStatement.values())
      if (!settlement.settled) owed += settlement.remaining;
    const unsettled: MinerListEntry['unsettled'] = [];
    for (const s of statements) {
      const settlement = allocation.byStatement.get(s.id);
      if (!settlement || settlement.settled) continue;
      unsettled.push({
        id: s.id,
        issuedAt: s.issuedAt,
        declarations: records.declarations.filter((d) => d.statementId === s.id),
      });
    }
    const statementIds = new Set(statements.map((s) => s.id));
    entries.push({
      minerId,
      owed,
      credit: allocation.credit,
      lastPaidAt,
      unsettled,
      unresolvedDeclarations: records.declarations.filter(
        (d) => !d.resolution && statementIds.has(d.statementId as string)
      ),
    });
  }

  let donationsBeforeBook = 0;
  const unmatchedPayments: Data[] = [];
  for (const p of records.payments) {
    if (
      p.source === 'donation' &&
      records.startDate &&
      isBeforeBook(p.at as string, records.startDate)
    )
      donationsBeforeBook += 1;
    else if (!p.minerId) unmatchedPayments.push(p);
  }
  const extractions = (records.extractions as unknown as MirrorExtraction[]).filter((x) =>
    inWindow(x, records.expiryHours, now)
  );
  return {
    [MINER_LIST_DOC]: { schema: READ_MODELS_SCHEMA, miners: entries },
    [OVERVIEW_DOC]: {
      schema: READ_MODELS_SCHEMA,
      donationsBeforeBook,
      unmatchedPayments,
      extractions: extractions as unknown as Data[],
    },
  };
}

/** Drops `undefined`, which Firestore refuses. */
export function plainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** JSON with sorted keys: Firestore hands fields back in its own order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export interface ReadModelsPlan {
  writes: { id: string; data: Data }[];
  mismatches: { id: string; kind: 'missing' | 'stale' }[];
}

/** Which docs differ from what `fresh` says they should be (`updatedAt` and unknown fields ignored). */
export function planReadModels(
  fresh: ReadModels,
  existing: ReadonlyMap<string, Data>
): ReadModelsPlan {
  const plan: ReadModelsPlan = { writes: [], mismatches: [] };
  for (const id of [MINER_LIST_DOC, OVERVIEW_DOC] as const) {
    const want = plainData(fresh[id]) as unknown as Data;
    const held = existing.get(id);
    const same =
      held !== undefined &&
      Object.entries(want).every(([k, v]) => canonical(held[k]) === canonical(v));
    if (same) continue;
    plan.writes.push({ id, data: want });
    plan.mismatches.push({ id, kind: held === undefined ? 'missing' : 'stale' });
  }
  return plan;
}
