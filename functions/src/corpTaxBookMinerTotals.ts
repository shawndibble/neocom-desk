// Miner running totals (issue #5255, ADR 0032): the frozen part of a Miner's account, kept
// in `corps/{id}/minerTotals/{minerId}`. Shadow mode: nothing reads the docs yet.
//
// Only frozen things go in: issued Statements, payments, dismissals of billed days,
// officer write-offs, declarations. Open days (unbilled, pending) change with prices and
// the clock, so they are never stored, and neither is standing (needs live ESI).
//
// Every total is a pure function of one Miner's stored records (`computeMinerTotals`), so
// "update on events" means: work out which Miners an event touched (`editScope`), recompute
// just those, write the ones that changed (`planTotals`). The scheduled verifier plans the
// same over every Miner. Pure and dependency-free: src/engine/corpTaxBook/minerTotals.test.ts
// imports it to prove the results equal the client engine's full recompute.

import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  allocatePayments,
  dismissalCredits,
  isBeforeBook,
  overdueAtFor,
  writeOffForAllocation,
  type MirrorDeclaration,
  type MirrorDismissal,
  type MirrorExtraction,
} from './corpTaxBookEngine.js';

export const MINER_TOTALS = 'minerTotals';
/** Bump when a total's meaning changes; the verifier then rewrites every doc. */
export const MINER_TOTALS_SCHEMA = 1;

type Data = Record<string, unknown>;

/** A Miner's frozen totals, as stored (plus a server `updatedAt` the writer adds). */
export interface MinerTotals {
  schema: number;
  minerId: string;
  mainCharacterId: number;
  characterIds: number[];
  /** A guest's account was closed (`closedAt` on the grouping doc). */
  closed: boolean;
  statements: number;
  /** Σ Statement amounts. */
  billed: number;
  /** Σ tax payments (donations and manual, less "not tax"), before the book excluded. */
  paid: number;
  /** What active dismissals credited to billed days. */
  dismissed: number;
  /** The shortfalls the settle tolerance wrote off. */
  toleranceWrittenOff: number;
  /** What officer write-offs forgave. */
  officerWrittenOff: number;
  /** Payment nothing absorbed. */
  credit: number;
  /** Billed − paid − dismissed − write-offs; negative is credit. */
  balance: number;
  /** What is still due on unsettled Statements (excludes credit). */
  owed: number;
  /** Lifetime ore units on billed days, value and tax as billed (frozen lines). */
  minedUnits: number;
  minedValue: number;
  tax: number;
  /** ISO instant of the latest payment that was tax; null when none. */
  lastPaidAt: string | null;
  /** When the earliest unsettled Statement goes Overdue (pauses counted); null when none. */
  overdueAt: string | null;
  /** Unresolved declarations on unsettled Statements: the account is, or was, paused. */
  openDeclarations: number;
}

/** A Miner's records, already narrowed to that Miner except `dismissals`, `declarations` and `extractions`. */
export interface MinerRecords {
  minerId: string;
  miner?: Data;
  statements: readonly Data[];
  payments: readonly Data[];
  writeOffs: readonly Data[];
}

/** Whole-book inputs every Miner's totals read. */
export interface BookRules {
  startDate?: string;
  overdueDays: number;
  expiryHours: Readonly<Record<string, number>>;
  dismissals: readonly Data[];
  declarations: readonly Data[];
  extractions: readonly Data[];
}

const money = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function lines(statement: Data): Data[] {
  return Array.isArray(statement.lines) ? (statement.lines as Data[]) : [];
}

export function computeMinerTotals(rec: MinerRecords, rules: BookRules): MinerTotals {
  const statements = rec.statements.map((s) => ({
    id: s.id as string,
    amount: num(s.amount),
    issuedAt: s.issuedAt as string,
    lines: lines(s),
  }));
  const payments = rec.payments.map((p) => ({
    id: p.id as string,
    amount: num(p.amount),
    at: p.at as string,
    ...(p.source === 'donation' || p.source === 'manual'
      ? { source: p.source as 'donation' | 'manual' }
      : {}),
    ...(typeof p.statementId === 'string' ? { statementId: p.statementId } : {}),
    ...(typeof p.notTaxAmount === 'number' ? { notTaxAmount: p.notTaxAmount } : {}),
  }));
  const credits = dismissalCredits({
    minerId: rec.minerId,
    statements,
    dismissals: rules.dismissals as readonly MirrorDismissal[],
    extractions: rules.extractions as unknown as MirrorExtraction[],
    expiryHours: rules.expiryHours,
  });
  const allocation = allocatePayments({
    statements,
    payments,
    dismissalCredits: credits,
    officerWriteOffs: rec.writeOffs.flatMap((d) => writeOffForAllocation(d) ?? []),
    startDate: rules.startDate,
  });

  // The payments the allocation counted (a donation before the book is neither credited nor shown).
  const counted = payments.filter(
    (p) => p.source !== 'donation' || !rules.startDate || !isBeforeBook(p.at, rules.startDate)
  );
  let paid = 0;
  let lastPaidAt: string | null = null;
  for (const p of counted) {
    const tax = p.amount - Math.min(p.notTaxAmount ?? 0, p.amount);
    paid += tax;
    if (p.amount - (p.notTaxAmount ?? 0) > 0 && (lastPaidAt === null || p.at > lastPaidAt))
      lastPaidAt = p.at;
  }

  let minedUnits = 0;
  let minedValue = 0;
  let tax = 0;
  for (const s of statements) {
    for (const line of s.lines) {
      if (typeof line.chargeKey !== 'string') continue;
      minedValue += num(line.estimatedValue);
      tax += num(line.tax);
      for (const o of (line.oreLines as Data[] | undefined) ?? []) minedUnits += num(o.quantity);
    }
  }

  let toleranceWrittenOff = 0;
  let officerWrittenOff = 0;
  let owed = 0;
  let overdueAt: string | null = null;
  let openDeclarations = 0;
  for (const s of statements) {
    const settlement = allocation.byStatement.get(s.id);
    if (!settlement) continue;
    toleranceWrittenOff += settlement.writtenOff;
    officerWrittenOff += settlement.forgiven;
    if (settlement.settled) continue;
    owed += settlement.remaining;
    const declarations = rules.declarations.filter((d) => d.statementId === s.id);
    openDeclarations += declarations.filter((d) => !d.resolution).length;
    const at = overdueAtFor(
      s.issuedAt,
      rules.overdueDays,
      declarations as unknown as MirrorDeclaration[]
    );
    if (overdueAt === null || at < overdueAt) overdueAt = at;
  }

  const characterIds = Array.isArray(rec.miner?.characterIds)
    ? (rec.miner!.characterIds as number[])
    : (() => {
        const solo = /^solo:(\d+)$/.exec(rec.minerId);
        return solo ? [Number(solo[1])] : [];
      })();
  return {
    schema: MINER_TOTALS_SCHEMA,
    minerId: rec.minerId,
    mainCharacterId: num(rec.miner?.mainCharacterId) || characterIds[0] || 0,
    characterIds,
    closed: rec.miner?.closedAt != null,
    statements: statements.length,
    billed: money(statements.reduce((sum, s) => sum + s.amount, 0)),
    paid: money(paid),
    dismissed: money(credits.reduce((sum, c) => sum + c.amount, 0)),
    toleranceWrittenOff: money(toleranceWrittenOff),
    officerWrittenOff: money(officerWrittenOff),
    credit: money(allocation.credit),
    balance: money(allocation.balance),
    owed: money(owed),
    minedUnits,
    minedValue: money(minedValue),
    tax: money(tax),
    lastPaidAt,
    overdueAt,
    openDeclarations,
  };
}

/** Every record of a book that the totals read. Statements, payments and write-offs carry a `minerId`. */
export interface BookRecords extends BookRules {
  statements: readonly Data[];
  payments: readonly Data[];
  writeOffs: readonly Data[];
  /** `miners/{id}` grouping docs, each with its `id`. */
  miners: readonly Data[];
}

/** A Miner with nothing frozen and no grouping has no totals doc. */
function isEmpty(rec: MinerRecords): boolean {
  return (
    rec.miner === undefined &&
    rec.statements.length === 0 &&
    rec.payments.length === 0 &&
    rec.writeOffs.length === 0
  );
}

/** Miner ids the records mention, for a scope of `'all'`. */
export function minerIdsIn(records: BookRecords): Set<string> {
  const ids = new Set<string>();
  for (const s of records.statements) if (typeof s.minerId === 'string') ids.add(s.minerId);
  for (const p of records.payments) if (typeof p.minerId === 'string') ids.add(p.minerId);
  for (const w of records.writeOffs) if (typeof w.minerId === 'string') ids.add(w.minerId);
  for (const m of records.miners) ids.add(m.id as string);
  return ids;
}

/** The fields that differ between two totals docs (`updatedAt` and unknown fields ignored). */
export function differingFields(
  stored: Data | undefined,
  fresh: MinerTotals | null
): string[] | 'missing' | 'orphan' | null {
  if (!stored) return fresh ? 'missing' : null;
  if (!fresh) return 'orphan';
  const out: string[] = [];
  for (const [key, value] of Object.entries(fresh)) {
    const held = stored[key];
    const same = Array.isArray(value)
      ? JSON.stringify(held) === JSON.stringify(value)
      : held === value;
    if (!same) out.push(key);
  }
  return out.length > 0 ? out : null;
}

export interface TotalsPlan {
  writes: MinerTotals[];
  deletes: string[];
  mismatches: { minerId: string; kind: 'missing' | 'stale' | 'orphan'; fields: string[] }[];
  checked: number;
}

/**
 * What it takes to bring `existing` (minerId → stored doc) in line with `records`, for the
 * Miners in `scope` (`'all'`: every Miner the records or the existing docs mention).
 */
export function planTotals(
  records: BookRecords,
  existing: ReadonlyMap<string, Data>,
  scope: readonly string[] | 'all'
): TotalsPlan {
  const ids =
    scope === 'all' ? new Set([...minerIdsIn(records), ...existing.keys()]) : new Set(scope);
  const plan: TotalsPlan = { writes: [], deletes: [], mismatches: [], checked: 0 };
  const byMiner = <T extends Data>(rows: readonly T[], id: string) =>
    rows.filter((r) => r.minerId === id);
  for (const minerId of [...ids].sort()) {
    const rec: MinerRecords = {
      minerId,
      miner: records.miners.find((m) => m.id === minerId),
      statements: byMiner(records.statements, minerId),
      payments: byMiner(records.payments, minerId),
      writeOffs: byMiner(records.writeOffs, minerId),
    };
    const fresh = isEmpty(rec) ? null : computeMinerTotals(rec, records);
    const diff = differingFields(existing.get(minerId), fresh);
    plan.checked += 1;
    if (diff === null) continue;
    if (fresh) plan.writes.push(fresh);
    else plan.deletes.push(minerId);
    plan.mismatches.push({
      minerId,
      kind: diff === 'missing' ? 'missing' : diff === 'orphan' ? 'orphan' : 'stale',
      fields: Array.isArray(diff) ? diff : [],
    });
  }
  return plan;
}

// --- Which Miners an edit touches ---------------------------------------------

/** What an edit (or a sync, or a claim) needs recomputed. */
export interface Scope {
  minerIds: string[];
  /** Statements and payments whose Miner has to be looked up after the write. */
  statementIds: string[];
  paymentIds: string[];
  /** Everything: a rule every Miner reads changed. */
  all: boolean;
}

const none = (): Scope => ({ minerIds: [], statementIds: [], paymentIds: [], all: false });

/**
 * The Miners an edit action changes the frozen totals of. Over-including only costs a
 * read; leaving one out is what the verifier exists to catch.
 */
export function editScope(action: { action: string } & Data): Scope {
  const s = none();
  const a = action as Data;
  const miner = (id: unknown) => {
    if (typeof id === 'string') s.minerIds.push(id);
  };
  switch (action.action) {
    case 'updateSettings': {
      const patch = (a.patch ?? {}) as Data;
      // The start date filters pre-book donations; overdue days and expiry feed every total.
      if (
        patch.startDate !== undefined ||
        patch.overdueDays !== undefined ||
        patch.structureExpiryHours !== undefined
      )
        s.all = true;
      break;
    }
    case 'recordPayment':
    case 'addAdjustment':
    case 'writeOff':
    case 'rebill':
      miner(a.minerId);
      break;
    case 'assignPayment':
      miner(a.minerId);
      break;
    case 'markNotTax':
      s.paymentIds.push(a.paymentId as string);
      break;
    case 'dismiss':
      if (a.scope === 'miner') miner(a.targetId);
      else s.all = true;
      break;
    case 'dismissRecords':
    case 'reverseDismissal':
    case 'linkSurvey':
      s.all = true;
      break;
    case 'setMiner':
    case 'unlink':
      miner(a.minerId);
      if (typeof a.characterId === 'number') miner(`solo:${a.characterId}`);
      for (const id of (a.characterIds as number[] | undefined) ?? []) miner(`solo:${id}`);
      break;
    case 'regroupMiner':
      miner(a.minerId);
      for (const id of (a.absorbMinerIds as string[] | undefined) ?? []) miner(id);
      for (const id of (a.characterIds as number[] | undefined) ?? []) miner(`solo:${id}`);
      break;
    case 'closeAccount':
      miner(a.minerId);
      break;
    case 'issueStatement':
      miner((a.statement as Data | undefined)?.minerId);
      break;
    case 'settleStatements':
      s.statementIds.push(...((a.statementIds as string[] | undefined) ?? []));
      break;
    case 'declare':
      s.statementIds.push(a.statementId as string);
      break;
    case 'resolveDeclaration':
      // The declaration names its Statement; the caller resolves it from the doc.
      s.statementIds.push(`declaration:${a.declarationId as string}`);
      break;
    default:
      break;
  }
  return s;
}

/** Whether two pulls at one structure cover the same day (the phase-0 assumption the verifier checks, ADR 0032). */
export function overlappingPulls(
  extractions: readonly Data[],
  expiryHours: Readonly<Record<string, number>>
): { structureId: number; a: string; b: string }[] {
  const windows = (extractions as unknown as MirrorExtraction[])
    .filter(
      (x) => !x.cancelledAt && !Number.isNaN(Date.parse(x.laserFiredAt ?? x.naturalDecayTime))
    )
    .map((x) => {
      const fracturedAt = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
      const hours = Math.min(
        expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
        MAX_EXPIRY_HOURS
      );
      return {
        structureId: x.structureId,
        id: `${x.structureId}_${Date.parse(x.extractionStartTime)}`,
        from: new Date(fracturedAt).toISOString().slice(0, 10),
        to: new Date(fracturedAt + hours * 3_600_000).toISOString().slice(0, 10),
      };
    });
  const out: { structureId: number; a: string; b: string }[] = [];
  for (let i = 0; i < windows.length; i++)
    for (let j = i + 1; j < windows.length; j++) {
      const x = windows[i];
      const y = windows[j];
      if (x.structureId === y.structureId && x.from <= y.to && y.from <= x.to)
        out.push({ structureId: x.structureId, a: x.id, b: y.id });
    }
  return out;
}
