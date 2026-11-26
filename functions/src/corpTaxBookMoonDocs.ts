import {
  chunkMinedPct,
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  extractionIdOf,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import { lockDateFor } from './corpTaxBookCheckpoint.js';
import { HOUR_MS, utcDay } from './timeConstants.js';

export const MOON_DOCS = 'moonDocs';
export const MOON_DOC_SCHEMA = 2;

type Data = Record<string, unknown>;

export interface OreQty {
  typeId: number;
  quantity: number;
}

export type ChunkSource = 'notification' | 'survey' | 'unknown';

export interface MoonDoc {
  schema: number;
  extractionId: string;
  structureId: number;
  moonId: number;
  startedAt: string;
  chunkArrivalAt: string;
  fracturedAt: string | null;
  expiresAt: string | null;
  cancelled: boolean;
  chunk: { source: ChunkSource; oreLines: OreQty[] };
  surveyId: string | null;
  mined: OreQty[];
  minedPct: number | null;
  minerCount: number;
  miners: { minerId: string; oreLines: OreQty[] }[];
  frozenTax: number;
  frozenLines: number;
}

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
  return { fracturedAt, expiresAt, from: utcDay(fracturedAt), to: utcDay(expiresAt) };
}

const sorted = (m: Map<number, number>): OreQty[] =>
  [...m].map(([typeId, quantity]) => ({ typeId, quantity })).sort((a, b) => a.typeId - b.typeId);

export interface StoredExtraction extends MirrorExtraction {
  oreLines?: OreQty[];
  surveyId?: string;
}

export interface MoonRules {
  expiryHours: Readonly<Record<string, number>>;
  statements?: readonly Data[];
  minerOf: (characterId: number, date: string) => string;
}

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
      const minerId = rules.minerOf(row.characterId, row.date);
      const own = perMiner.get(minerId) ?? new Map<number, number>();
      own.set(row.typeId, (own.get(row.typeId) ?? 0) + row.quantity);
      perMiner.set(minerId, own);
    }
  }

  const notified = (x.oreLines ?? []).map((l) => ({ typeId: l.typeId, quantity: l.quantity }));
  const surveyId = typeof x.surveyId === 'string' ? x.surveyId : null;
  const source: ChunkSource =
    notified.length > 0 ? 'notification' : surveyId !== null ? 'survey' : 'unknown';

  const minedPct = notified.length > 0 ? chunkMinedPct(notified, sorted(mined)) : null;

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
    frozenTax: 0,
    frozenLines: 0,
  };
}

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
  deletes: string[];
  checked: number;
  mismatches: { extractionId: string }[];
}

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

export function moonDocsToCheck(
  extractions: readonly StoredExtraction[],
  held: ReadonlyMap<string, unknown>,
  expiryHours: Readonly<Record<string, number>>,
  today: string
): Set<string> {
  const lockDate = lockDateFor(today);
  const out = new Set<string>();
  const live = new Set<string>();
  for (const x of extractions) {
    const id = extractionIdOf(x);
    live.add(id);
    const window = pullWindow(x, expiryHours);
    const open = window === null || window.to >= lockDate;
    if (open || held.get(id) !== MOON_DOC_SCHEMA) out.add(id);
  }
  for (const id of held.keys()) if (!live.has(id)) out.add(id);
  return out;
}

export function overlappingPulls(
  extractions: readonly object[],
  expiryHours: Readonly<Record<string, number>>
): { structureId: number; a: string; b: string }[] {
  const windows = (extractions as unknown as MirrorExtraction[]).flatMap((x) => {
    const window = x.cancelledAt ? null : pullWindow(x, expiryHours);
    return window ? [{ structureId: x.structureId, id: extractionIdOf(x), ...window }] : [];
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
