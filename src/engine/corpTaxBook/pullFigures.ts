/**
 * What the moon page reads from the per-pull moon docs instead of the whole ledger (#5716,
 * ADR 0032). Pure: no fetch, DOM or Dexie.
 *
 * A pull's window is at most 5 dates at one refinery. The page reads the shown pull's rows
 * in full, so its figures come from the engine exactly as the whole-book path computes them.
 * An earlier cycle of the same moon needs a ledger row only while one of the Miners in its
 * doc has a window day after the last day its Statements took in; every other cycle prints the doc's figures
 * (mined ore, Miner count, the tax its Statements froze). One doc missing or on another
 * schema sends the page back to the whole-book path: mixing saves no reads.
 *
 * Known gap, the Miner page's (`minerScope.ts`): a day dismissed or never billed older than
 * a Miner's newest Statement is not looked for in a cycle whose rows are not read.
 */
import {
  MOON_DOC_SCHEMA,
  pullWindow,
  type MoonDoc,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { BookView, ExtractionRow } from './bookView';
import type { Statement } from './statements';
import { extractionId, type SyncExtraction } from './sync';

/** A doc this client can read: current schema and the fields the page takes. */
export function moonDocUsable(doc: MoonDoc | undefined): doc is MoonDoc {
  return (
    doc !== undefined &&
    doc.schema === MOON_DOC_SCHEMA &&
    Array.isArray(doc.mined) &&
    Array.isArray(doc.miners) &&
    Number.isFinite(doc.minerCount) &&
    Number.isFinite(doc.frozenTax)
  );
}

/** One pull's rows to read: its refinery and the first and last date its window covers. */
export interface PullRows {
  extractionId: string;
  structureId: number;
  from: string;
  to: string;
}

export type MoonScope =
  | { ok: false }
  | {
      ok: true;
      /** Pulls whose rows are read; their figures come from the engine. */
      rows: PullRows[];
      /** The shown pull's moon's other cycles, whose figures come from their docs. */
      fromDocs: ReadonlySet<string>;
    };

export interface MoonScopeInput {
  extractionId: string;
  extractions: readonly SyncExtraction[];
  /** Docs read for the shown pull's refinery, by extraction id. */
  docs: ReadonlyMap<string, MoonDoc>;
  statements: readonly Statement[];
  startDate: string;
  expiryHours: Readonly<Record<string, number>>;
}

/** Which pulls need ledger rows to print the moon page, and which print their doc's figures. */
export function planMoonScope(input: MoonScopeInput): MoonScope {
  const shown = input.extractions.find((x) => extractionId(x) === input.extractionId);
  // Not a pull of this book: the page says so without any row.
  if (!shown) return { ok: true, rows: [], fromDocs: new Set() };
  if (!moonDocUsable(input.docs.get(input.extractionId))) return { ok: false };

  // The last day each Miner's Statements took in: a day on or before it is billed (frozen).
  const billedThrough = new Map<string, string>();
  for (const s of input.statements)
    if (s.coversThrough > (billedThrough.get(s.minerId) ?? ''))
      billedThrough.set(s.minerId, s.coversThrough);
  const canBeOpen = (minerId: string, date: string) => {
    const through = billedThrough.get(minerId);
    return through === undefined ? date >= input.startDate : date > through;
  };
  const rows: PullRows[] = [];
  const fromDocs = new Set<string>();
  const cycles = input.extractions.filter(
    (x) => x.structureId === shown.structureId && x.moonId === shown.moonId
  );
  for (const x of cycles) {
    const id = extractionId(x);
    const window = pullWindow(x, input.expiryHours);
    const doc = input.docs.get(id);
    const own = id === input.extractionId;
    if (!own && !moonDocUsable(doc)) return { ok: false };
    // A window that does not parse covers no day: the engine's answer is already the doc's.
    if (!window) continue;
    const open = own || (doc as MoonDoc).miners.some((m) => canBeOpen(m.minerId, window.to));
    if (open)
      rows.push({ extractionId: id, structureId: x.structureId, from: window.from, to: window.to });
    else fromDocs.add(id);
  }
  return { ok: true, rows, fromDocs };
}

/**
 * The view with each doc-backed cycle's mined share, Miner count and tax taken from its doc.
 * The share reads the doc's mined ore against the row's make-up, so a survey-sourced chunk
 * agrees with the whole-book view; tax is what the cycle's Statements froze.
 */
export function withMoonDocs(
  view: BookView,
  docs: ReadonlyMap<string, MoonDoc>,
  fromDocs: ReadonlySet<string>
): BookView {
  if (fromDocs.size === 0) return view;
  const figures = (row: ExtractionRow, doc: MoonDoc): ExtractionRow => {
    let minedPct: number | null = null;
    if (row.fracturedAt && row.oreLines.length) {
      const mined = new Map(doc.mined.map((m) => [m.typeId, m.quantity]));
      const total = row.oreLines.reduce((s, l) => s + l.quantity, 0);
      const got = row.oreLines.reduce(
        (s, l) => s + Math.min(l.quantity, mined.get(l.typeId) ?? 0),
        0
      );
      minedPct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
    }
    return { ...row, minedPct, minerCount: doc.minerCount, tax: doc.frozenTax };
  };
  return {
    ...view,
    extractions: view.extractions.map((row) => {
      const doc = docs.get(row.id);
      return fromDocs.has(row.id) && moonDocUsable(doc) ? figures(row, doc) : row;
    }),
  };
}
