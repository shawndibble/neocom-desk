// Per-pull moon docs (issue #5256, ADR 0032): one doc per Extraction in
// `corps/{id}/moonDocs/{extractionId}`, built from the raw structure-and-date rows. Shadow
// mode: nothing reads the docs yet.
//
// The doc stores inputs, never time-derived state: no "ready", "fractured" or "expired", and
// no live tax (that needs today's prices; the device computes it from the open days). What
// is stored is what a moon page needs to read in one go: the chunk's make-up and where it
// came from, the ore mined across every row in the pull window (rows no charge covers
// included), who mined it, and the tax the issued Statements froze for the window (D22).
//
// Pure and dependency-free: src/engine/corpTaxBook/moonDocs.test.ts imports it to prove the
// mined totals equal the client engine's `minedDuringExtraction`.

import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  extractionIdOf,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';

export const MOON_DOCS = 'moonDocs';
/** Bump when a field's meaning changes; the verifier then rewrites every doc. */
export const MOON_DOC_SCHEMA = 1;

type Data = Record<string, unknown>;

export interface OreQty {
  typeId: number;
  quantity: number;
}

export type ChunkSource = 'notification' | 'survey' | 'unknown';

/** A pull's doc, as stored (plus a server `updatedAt` the writer adds). */
export interface MoonDoc {
  schema: number;
  extractionId: string;
  structureId: number;
  moonId: number;
  startedAt: string;
  chunkArrivalAt: string;
  /** ISO instants; null when the Extraction's dates do not parse. */
  fracturedAt: string | null;
  expiresAt: string | null;
  cancelled: boolean;
  /** Where the chunk's make-up came from. A linked survey's rocks live client-side, so it reads as `survey` with no lines. */
  chunk: { source: ChunkSource; oreLines: OreQty[] };
  surveyId: string | null;
  /** Ore mined at the structure from the fracture day through the expiry day, per type. */
  mined: OreQty[];
  /** Share of the chunk mined, 0-100; null without a make-up. Needs the fracture time to mean anything. */
  minedPct: number | null;
  minerCount: number;
  /** Per Miner, the ore of every row in the window (a Miner is a grouping id, or `solo:<characterId>`). */
  miners: { minerId: string; oreLines: OreQty[] }[];
  /** Σ tax on issued Statement lines for the window's days; the live part is computed on the device. */
  frozenTax: number;
  frozenLines: number;
}

const HOUR_MS = 3_600_000;
const money = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Engine `fractureAndExpiry`, as the dates it covers. Null when the dates do not parse. */
export function pullWindow(
  x: Pick<MirrorExtraction, 'structureId' | 'naturalDecayTime' | 'laserFiredAt'>,
  expiryHours: Readonly<Record<string, number>>
): { fracturedAt: number; expiresAt: number; from: string; to: string } | null {
  const fracturedAt = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
  if (Number.isNaN(fracturedAt)) return null;
  const hours = Math.min(
    expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
    MAX_EXPIRY_HOURS
  );
  const expiresAt = fracturedAt + hours * HOUR_MS;
  return { fracturedAt, expiresAt, from: day(fracturedAt), to: day(expiresAt) };
}

const sorted = (m: Map<number, number>): OreQty[] =>
  [...m].map(([typeId, quantity]) => ({ typeId, quantity })).sort((a, b) => a.typeId - b.typeId);

/** An Extraction doc's stored fields beyond the mirror: the notification's ore and a linked survey. */
export interface StoredExtraction extends MirrorExtraction {
  oreLines?: OreQty[];
  surveyId?: string;
}

/** What every pull's doc reads besides its own rows. */
export interface MoonRules {
  expiryHours: Readonly<Record<string, number>>;
  /** Statements as stored; their `lines` carry structureId, date and tax. */
  statements: readonly Data[];
  /** A Character's Miner (grouping docs); a Character in none is `solo:<id>`. */
  minerOf: (characterId: number) => string;
}

/**
 * One pull's doc. `rows` may hold the structure's rows beyond the window; the window is
 * applied here, so the result equals the engine's whatever the caller loaded.
 */
export function computeMoonDoc(
  x: StoredExtraction,
  rows: readonly ObservedRow[],
  rules: MoonRules
): MoonDoc {
  const window = pullWindow(x, rules.expiryHours);
  const mined = new Map<number, number>();
  const perMiner = new Map<string, Map<number, number>>();
  if (window) {
    for (const row of rows) {
      if (row.structureId !== x.structureId || row.date < window.from || row.date > window.to)
        continue;
      mined.set(row.typeId, (mined.get(row.typeId) ?? 0) + row.quantity);
      const minerId = rules.minerOf(row.characterId);
      const own = perMiner.get(minerId) ?? new Map<number, number>();
      own.set(row.typeId, (own.get(row.typeId) ?? 0) + row.quantity);
      perMiner.set(minerId, own);
    }
  }

  const notified = (x.oreLines ?? []).map((l) => ({ typeId: l.typeId, quantity: l.quantity }));
  const surveyId = typeof x.surveyId === 'string' ? x.surveyId : null;
  // Source order (D13): the ExtractionStarted notification, then a linked survey.
  const source: ChunkSource =
    notified.length > 0 ? 'notification' : surveyId !== null ? 'survey' : 'unknown';

  let minedPct: number | null = null;
  if (notified.length > 0) {
    const total = notified.reduce((s, l) => s + l.quantity, 0);
    const got = notified.reduce((s, l) => s + Math.min(l.quantity, mined.get(l.typeId) ?? 0), 0);
    minedPct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
  }

  let frozenTax = 0;
  let frozenLines = 0;
  if (window) {
    for (const s of rules.statements) {
      for (const line of Array.isArray(s.lines) ? (s.lines as Data[]) : []) {
        if (typeof line.chargeKey !== 'string' || line.structureId !== x.structureId) continue;
        const date = line.date;
        if (typeof date !== 'string' || date < window.from || date > window.to) continue;
        frozenTax += num(line.tax);
        frozenLines += 1;
      }
    }
  }

  return {
    schema: MOON_DOC_SCHEMA,
    extractionId: extractionIdOf(x),
    structureId: x.structureId,
    moonId: x.moonId,
    startedAt: x.extractionStartTime,
    chunkArrivalAt: x.chunkArrivalTime,
    fracturedAt: window ? new Date(window.fracturedAt).toISOString() : null,
    expiresAt: window ? new Date(window.expiresAt).toISOString() : null,
    cancelled: Boolean(x.cancelledAt),
    chunk: { source, oreLines: notified },
    surveyId,
    mined: sorted(mined),
    minedPct,
    minerCount: perMiner.size,
    miners: [...perMiner]
      .map(([minerId, lines]) => ({ minerId, oreLines: sorted(lines) }))
      .sort((a, b) => a.minerId.localeCompare(b.minerId)),
    frozenTax: money(frozenTax),
    frozenLines,
  };
}

/** The fields a stored doc and a recompute are compared on (all but the server's `updatedAt`). */
export function moonDocDiffers(stored: Data | undefined, fresh: MoonDoc): boolean {
  if (!stored) return true;
  const held = { ...stored };
  delete held.updatedAt;
  return JSON.stringify(sortKeys(held)) !== JSON.stringify(sortKeys(fresh));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Data)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortKeys(val)])
    );
  return v;
}

export interface MoonDocPlan {
  writes: MoonDoc[];
  /** Docs whose Extraction is gone. */
  deletes: string[];
  checked: number;
  /** Stored docs that differed from the recompute (not new ones): drift the verifier reports. */
  mismatches: { extractionId: string }[];
}

/**
 * Recomputes `wanted` pulls (or every pull) and says which docs to write. `rowsOf` returns a
 * structure's rows; a caller reads each structure once.
 */
export function planMoonDocs(
  extractions: readonly StoredExtraction[],
  existing: ReadonlyMap<string, Data>,
  scope: ReadonlySet<string> | 'all',
  rowsOf: (structureId: number) => readonly ObservedRow[],
  rules: MoonRules
): MoonDocPlan {
  const plan: MoonDocPlan = { writes: [], deletes: [], checked: 0, mismatches: [] };
  const live = new Set<string>();
  for (const x of extractions) {
    const id = extractionIdOf(x);
    live.add(id);
    if (scope !== 'all' && !scope.has(id)) continue;
    plan.checked += 1;
    const doc = computeMoonDoc(x, rowsOf(x.structureId), rules);
    const stored = existing.get(id);
    if (!moonDocDiffers(stored, doc)) continue;
    plan.writes.push(doc);
    if (stored) plan.mismatches.push({ extractionId: id });
  }
  for (const id of existing.keys()) {
    if (live.has(id) || (scope !== 'all' && !scope.has(id))) continue;
    plan.deletes.push(id);
  }
  return plan;
}
