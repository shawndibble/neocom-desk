import {
  MOON_DOC_SCHEMA,
  pullWindow,
  type MoonDoc,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { BookView, ExtractionRow } from './bookView';
import { extractionId, type SyncExtraction } from './sync';
import { chunkMinedPct, splitChunkVariants } from './moonOreVariants';
import { utcDayOf } from '../localDay';

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
      rows: PullRows[];
      fromDocs: ReadonlySet<string>;
    };

export interface MoonScopeInput {
  extractionId: string;
  extractions: readonly SyncExtraction[];
  docs: ReadonlyMap<string, MoonDoc>;
  expiryHours: Readonly<Record<string, number>>;
}

export function planMoonScope(input: MoonScopeInput): MoonScope {
  const shown = input.extractions.find((x) => extractionId(x) === input.extractionId);
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
    if (!window) continue;
    rows.push({ extractionId: id, structureId: x.structureId, from: window.from, to: window.to });
  }
  return { ok: true, rows, fromDocs: new Set() };
}

export function withMoonDocs(
  view: BookView,
  docs: ReadonlyMap<string, MoonDoc>,
  fromDocs: ReadonlySet<string>
): BookView {
  if (fromDocs.size === 0) return view;
  const prices = view.input.pricesOn(utcDayOf(view.input.now)).prices;
  const figures = (row: ExtractionRow, doc: MoonDoc): ExtractionRow => {
    const oreLines = splitChunkVariants(row.oreLines, doc.mined);
    const resplit = JSON.stringify(oreLines) !== JSON.stringify(row.oreLines);
    const estimatedValue =
      resplit && oreLines.every((l) => prices.has(l.typeId))
        ? oreLines.reduce((sum, l) => sum + l.quantity * prices.get(l.typeId)!, 0)
        : row.estimatedValue;
    const minedPct = row.fracturedAt && oreLines.length ? chunkMinedPct(oreLines, doc.mined) : null;
    return { ...row, oreLines, estimatedValue, minedPct, minerCount: doc.minerCount };
  };
  return {
    ...view,
    extractions: view.extractions.map((row) => {
      const doc = docs.get(row.id);
      return fromDocs.has(row.id) && moonDocUsable(doc) ? figures(row, doc) : row;
    }),
  };
}
