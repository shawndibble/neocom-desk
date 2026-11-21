/**
 * What the moon page reads from the per-pull moon docs instead of the whole ledger (#5716,
 * ADR 0032). Pure: no fetch, DOM or Dexie.
 *
 * A pull's window is at most 5 dates at one refinery. The page reads the window rows of the
 * shown pull and of the moon's other cycles, so every figure, tax included, comes from the
 * engine exactly as the whole-book path computes it: a moon doc carries no tax (its frozen tax
 * counted calendar Statements, and is 0 since schema 2). The docs still give a refinery page
 * that reads no row its mined share and Miner count. One doc missing or on another schema sends
 * the moon page back to the whole-book path.
 */
import {
  MOON_DOC_SCHEMA,
  pullWindow,
  type MoonDoc,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { BookView, ExtractionRow } from './bookView';
import { extractionId, type SyncExtraction } from './sync';

/** A doc this client can read: current schema and the fields the page takes. */
export function moonDocUsable(doc: MoonDoc | undefined): doc is MoonDoc {
  return (
    doc !== undefined &&
    doc.schema === MOON_DOC_SCHEMA &&
    Array.isArray(doc.mined) &&
    doc.mined.every((m) => typeof m?.typeId === 'number' && Number.isFinite(m.quantity)) &&
    Array.isArray(doc.miners) &&
    doc.miners.every((m) => typeof m?.minerId === 'string') &&
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
      /** Cycles whose mined share and Miner count come from their docs (none on a moon page). */
      fromDocs: ReadonlySet<string>;
    };

export interface MoonScopeInput {
  extractionId: string;
  extractions: readonly SyncExtraction[];
  /** Docs read for the shown pull's refinery, by extraction id. */
  docs: ReadonlyMap<string, MoonDoc>;
  expiryHours: Readonly<Record<string, number>>;
}

/** The pulls whose ledger rows print the moon page: the shown one and the moon's other cycles. */
export function planMoonScope(input: MoonScopeInput): MoonScope {
  const shown = input.extractions.find((x) => extractionId(x) === input.extractionId);
  // Not a pull of this book: the page says so without any row.
  if (!shown) return { ok: true, rows: [], fromDocs: new Set() };
  if (!moonDocUsable(input.docs.get(input.extractionId))) return { ok: false };

  const rows: PullRows[] = [];
  const cycles = input.extractions.filter(
    (x) => x.structureId === shown.structureId && x.moonId === shown.moonId
  );
  for (const x of cycles) {
    const id = extractionId(x);
    const window = pullWindow(x, input.expiryHours);
    if (id !== input.extractionId && !moonDocUsable(input.docs.get(id))) return { ok: false };
    // A window that does not parse covers no day.
    if (!window) continue;
    rows.push({ extractionId: id, structureId: x.structureId, from: window.from, to: window.to });
  }
  return { ok: true, rows, fromDocs: new Set() };
}

/**
 * The view with each doc-backed cycle's mined share and Miner count taken from its doc. The share
 * reads the doc's mined ore against the row's make-up, so a survey-sourced chunk agrees with the
 * whole-book view. Its tax stays the view's: a doc carries none.
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
    return { ...row, minedPct, minerCount: doc.minerCount };
  };
  return {
    ...view,
    extractions: view.extractions.map((row) => {
      const doc = docs.get(row.id);
      return fromDocs.has(row.id) && moonDocUsable(doc) ? figures(row, doc) : row;
    }),
  };
}
