import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';

export interface AppraisalPasteEntry {
  name: string;
  quantity: number;
  lines: number[];
}

const X_SUFFIX = /^(.*\S)\s+x\s*(\d[\d.,']*)$/i;

const TRAILING_QUANTITY = /^(.*\S)\s+(\d[\d.,']*)$/;

function parseQuantity(raw: string): number | null {
  const value = parseLocalizedNumber(raw);
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isUnreadableQuantity(raw: string): boolean {
  const token = raw.trim();
  return /^\d/.test(token) && !/^\d+$|^\d{1,3}(,\d{3})+$/.test(token);
}

export type UnreadableReason = 'unreadable-number' | 'text-quantity';

export interface QuantityColumn {
  column: number;
  value: string;
}

type UnreadableLine =
  | { unreadable: true; reason: 'unreadable-number' }
  | { unreadable: true; reason: 'text-quantity'; columns: QuantityColumn[] };

export interface AppraisalPasteOptions {
  quantityColumn?: number | null;
  textQuantityAsOne?: boolean;
}

function wholeNumberColumns(fields: string[]): QuantityColumn[] {
  const columns: QuantityColumn[] = [];
  for (let i = 2; i < fields.length; i++) {
    const value = fields[i].trim();
    if (parseQuantity(value) !== null) columns.push({ column: i + 1, value });
  }
  return columns;
}

function parseLine(
  text: string,
  {
    quantityColumn,
    textQuantityAsOne,
  }: { quantityColumn: number | null; textQuantityAsOne: boolean }
): { name: string; quantity: number } | UnreadableLine {
  if (text.includes('\t')) {
    const fields = text.split('\t');
    const [name, quantity = ''] = fields;
    const trimmedName = name.trim();
    if (trimmedName === '') return { name: text.trim(), quantity: 1 };
    const parsed = parseQuantity(quantity);
    if (parsed === null && isUnreadableQuantity(quantity)) {
      return { unreadable: true, reason: 'unreadable-number' };
    }
    if (quantity.trim() !== '' && !/\d/.test(quantity)) {
      if (quantityColumn !== null) {
        const chosen = parseQuantity(fields[quantityColumn - 1] ?? '');
        if (chosen !== null) return { name: trimmedName, quantity: chosen };
      }
      if (textQuantityAsOne) return { name: trimmedName, quantity: 1 };
      return { unreadable: true, reason: 'text-quantity', columns: wholeNumberColumns(fields) };
    }
    return { name: trimmedName, quantity: parsed ?? 1 };
  }

  for (const pattern of [X_SUFFIX, TRAILING_QUANTITY]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const quantity = parseQuantity(match[2]);
    if (quantity !== null) return { name: match[1], quantity };
    if (/[.']/.test(match[2])) return { unreadable: true, reason: 'unreadable-number' };
  }

  return { name: text, quantity: 1 };
}

const LINE_BREAK = /\r\n|\r|\n/;

export function countPasteLines(text: string): number {
  return text.split(LINE_BREAK).filter((line) => line.trim() !== '').length;
}

const PASTE_BOX_MIN_ROWS = 4;
const PASTE_BOX_MAX_ROWS = 14;
const PASTE_BOX_EMPTY_ROWS = 6;

export function pasteBoxRows(text: string): number {
  const lines = countPasteLines(text);
  if (lines === 0) return PASTE_BOX_EMPTY_ROWS;
  return Math.min(PASTE_BOX_MAX_ROWS, Math.max(PASTE_BOX_MIN_ROWS, lines + 1));
}

interface PasteRow {
  name: string;
  quantity: number;
  line: number;
}

interface UnreadableRow extends PasteRow {
  why: UnreadableLine;
}

function countOf(quantity: number): number {
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

function itemRows(
  text: string,
  options: { quantityColumn: number | null; textQuantityAsOne: boolean }
): { rows: PasteRow[]; unreadable: UnreadableRow[] } {
  const rows: PasteRow[] = [];
  const unreadable: UnreadableRow[] = [];
  const lines = text.split(LINE_BREAK);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    const parsed = parseLine(trimmed, options);
    if ('unreadable' in parsed) {
      unreadable.push({ name: trimmed, quantity: 1, line: i + 1, why: parsed });
    } else rows.push({ name: parsed.name, quantity: parsed.quantity, line: i + 1 });
  }
  return { rows, unreadable };
}

function eftRows(text: string): PasteRow[] {
  const fit = parseEftFit(text);
  const rows: PasteRow[] = [];

  if (fit.shipName) rows.push({ name: fit.shipName, quantity: 1, line: fit.headerLine });
  for (const item of fit.items) {
    rows.push({ name: item.name, quantity: countOf(item.quantity), line: item.line });
  }
  for (const error of fit.errors) {
    rows.push({ name: error.text, quantity: 1, line: error.line });
  }

  return rows.sort((a, b) => a.line - b.line);
}

function mergeRows(rows: PasteRow[]): AppraisalPasteEntry[] {
  const entries: AppraisalPasteEntry[] = [];
  const byName = new Map<string, AppraisalPasteEntry>();

  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      existing.lines.push(row.line);
      continue;
    }
    const entry: AppraisalPasteEntry = {
      name: row.name,
      quantity: row.quantity,
      lines: [row.line],
    };
    byName.set(key, entry);
    entries.push(entry);
  }

  return entries;
}

export interface AppraisalUnreadableLine {
  name: string;
  lines: number[];
  reason: UnreadableReason;
  columns?: QuantityColumn[];
}

export function quantityColumnChoices(
  unreadable: readonly AppraisalUnreadableLine[]
): { column: number; sample: string }[] {
  const text = unreadable.filter((line) => line.reason === 'text-quantity');
  if (text.length === 0) return [];
  return (text[0].columns ?? [])
    .filter(({ column }) =>
      text.every((line) => line.columns?.some((candidate) => candidate.column === column))
    )
    .map(({ column, value }) => ({ column, sample: value }));
}

export function parseAppraisalPasteDetailed(
  text: string,
  { quantityColumn = null, textQuantityAsOne = false }: AppraisalPasteOptions = {}
): {
  entries: AppraisalPasteEntry[];
  unreadable: AppraisalUnreadableLine[];
} {
  if (looksLikeEftFit(text)) return { entries: mergeRows(eftRows(text)), unreadable: [] };
  const { rows, unreadable } = itemRows(text, { quantityColumn, textQuantityAsOne });
  const whyByLine = new Map(unreadable.map((row) => [row.line, row.why]));
  return {
    entries: mergeRows(rows),
    unreadable: mergeRows(unreadable).map(({ name, lines }) => {
      const why = whyByLine.get(lines[0])!;
      return why.reason === 'text-quantity'
        ? { name, lines, reason: why.reason, columns: why.columns }
        : { name, lines, reason: why.reason };
    }),
  };
}

export function parseAppraisalPaste(
  text: string,
  options?: AppraisalPasteOptions
): AppraisalPasteEntry[] {
  return parseAppraisalPasteDetailed(text, { textQuantityAsOne: true, ...options }).entries;
}

export function removeItemFromPaste(text: string, itemName: string): string | null {
  if (looksLikeEftFit(text)) return null;
  const target = itemName.trim().toLowerCase();
  const entry = parseAppraisalPaste(text).find((e) => e.name.trim().toLowerCase() === target);
  if (!entry) return text;

  const removed = new Set(entry.lines);
  const parts = text.split(/(\r\n|\r|\n)/);
  let kept = '';
  for (let i = 0; i < parts.length; i += 2) {
    if (removed.has(i / 2 + 1)) continue;
    kept += parts[i] + (parts[i + 1] ?? '');
  }
  return /(\r\n|\r|\n)$/.test(text) ? kept : kept.replace(/(\r\n|\r|\n)$/, '');
}
