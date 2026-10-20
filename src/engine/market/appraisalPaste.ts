/**
 * Parse a pasted stack of items into name + quantity entries, for the Market
 * page's **Appraisal** tab. Pure text-structure parse only — no typeID
 * resolution and no prices here; `appraisal.ts` does the arithmetic once a
 * caller has resolved names against the market catalogue.
 *
 * Accepts the four shapes a pilot actually has on their clipboard:
 *
 * - **Inventory copy** — `Name<tab>Qty`, and the wider `Name<tab>Qty<tab>Group
 *   <tab>Volume` EVE gives when the inventory is in details mode. Everything
 *   past the second field is dropped.
 * - **Multibuy** — `Name Qty`, space-separated, or `Name xQty` / `Name x Qty`.
 * - **A bare name**, which counts as one.
 * - **An EFT ship fit**, recognised by the `[Ship Name, Fit Name]` header its
 *   first non-blank line always carries. A fit is not a list of loose items:
 *   its hull is named only in that header, and a loaded module is written
 *   `Module Name, Charge Name` on one line. Both are handed to
 *   `engine/import/eftFit`'s `parseEftFit` — the same already-tested parser
 *   Fit Import and the Skill Planner's clipboard import read — so the hull is
 *   priced, the charge is priced separately from its module, and `[Empty ...
 *   slot]` placeholders are dropped rather than appraised (issue #1026).
 *
 * Quantities arrive thousands-separated (`124,500`), so they are stripped
 * before parsing rather than handed to `Number`, which answers `NaN` for those.
 *
 * The space-separated form is only read when the line has no tab in it. With a
 * tab present the tab *is* the separator, and a name whose own text ends in a
 * number ("Quafe Zero 10" is a real stack of a real item) would otherwise be
 * split in the wrong place. Even without a tab the trailing token has to be
 * digits alone, so `Zainou 'Gnome' Shield Management SM-703` keeps its model
 * number instead of being appraised as 703 of a type that does not exist.
 *
 * Repeated names merge into one entry — a paste is a pile, not a ledger, and
 * the same item can appear in it several times (two stacks of Tritanium from
 * two cans). Each entry carries every source line it came from, so a name that
 * resolves to nothing can be reported as the lines the reader actually sees.
 */

import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';

export interface AppraisalPasteEntry {
  /** As written, in the first spelling seen. Matching is the caller's job. */
  name: string;
  /** Always >= 1. */
  quantity: number;
  /** 1-indexed source lines this entry came from, in the order they appear. */
  lines: number[];
}

/**
 * A trailing `xN` count, the same suffix `engine/import/eftFit.ts` reads —
 * also hand-typed as `x N`. Without the optional space the plain
 * trailing-number rule reads `Tritanium x 1000` as 1000 of "Tritanium x".
 */
const X_SUFFIX = /^(.*\S)\s+x\s*(\d[\d.,']*)$/i;

/** A trailing standalone number: digits and grouping marks, nothing else. */
const TRAILING_QUANTITY = /^(.*\S)\s+(\d[\d.,']*)$/;

/**
 * `124,500` -> 124500, and so are `124.500`, `124 500` and `124'500`. Answers
 * null for anything that is not a positive whole number, so the caller decides
 * whether that is "one of these" or a line to report.
 */
function parseQuantity(raw: string): number | null {
  const value = parseLocalizedNumber(raw);
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * A token that begins like a number but is not one the parser can read — a
 * decimal (`12.5`), a unit (`5 m3`), a malformed grouping (`1.2.3`). Plain
 * digits and commas that fail (`0`, an overflow) are not this: they keep the
 * "one of these" fallback, since they are whole numbers that are merely
 * unusable. Reporting beats guessing: a wrong total with no warning is worse
 * than a line the pilot is told to fix.
 */
function isUnreadableQuantity(raw: string): boolean {
  const token = raw.trim();
  return /^\d/.test(token) && !/^\d+$|^\d{1,3}(,\d{3})+$/.test(token);
}

/** A line whose stated quantity could not be read; it is reported, not priced. */
interface UnreadableLine {
  unreadable: true;
}

/** Splits one non-blank line into its name and quantity, or flags it unreadable. */
function parseLine(text: string): { name: string; quantity: number } | UnreadableLine {
  if (text.includes('\t')) {
    const [name, quantity = ''] = text.split('\t');
    const trimmedName = name.trim();
    // A tab-led line with nothing before the tab is not a name; keep the
    // whole line so it surfaces as unmatched rather than vanishing.
    if (trimmedName === '') return { name: text.trim(), quantity: 1 };
    const parsed = parseQuantity(quantity);
    if (parsed === null && isUnreadableQuantity(quantity)) return { unreadable: true };
    return { name: trimmedName, quantity: parsed ?? 1 };
  }

  for (const pattern of [X_SUFFIX, TRAILING_QUANTITY]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const quantity = parseQuantity(match[2]);
    if (quantity !== null) return { name: match[1], quantity };
    // `Tritanium 12.5`: a trailing decimal is a mis-stated quantity, not a name.
    if (/[.']/.test(match[2])) return { unreadable: true };
  }

  return { name: text, quantity: 1 };
}

/** Every line ending EVE, Windows and the clipboard between them can produce. */
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * How many lines the parser would actually read — blank ones skipped, nothing
 * merged. Exported so the paste box can label itself without a second opinion
 * about what a line is; it is deliberately *not* the number of priced rows,
 * since repeated names merge into one.
 */
export function countPasteLines(text: string): number {
  return text.split(LINE_BREAK).filter((line) => line.trim() !== '').length;
}

/** Row bounds for the paste box: short pastes shrink it, long ones scroll inside it. */
const PASTE_BOX_MIN_ROWS = 4;
const PASTE_BOX_MAX_ROWS = 14;
/** An empty box keeps the multi-line placeholder fully visible. */
const PASTE_BOX_EMPTY_ROWS = 6;

/**
 * How tall the paste box should be for `text`: one spare row past the lines
 * pasted, clamped so a three-line list does not leave a mostly empty box
 * pushing the result down, and a long one scrolls rather than grows.
 */
export function pasteBoxRows(text: string): number {
  const lines = countPasteLines(text);
  if (lines === 0) return PASTE_BOX_EMPTY_ROWS;
  return Math.min(PASTE_BOX_MAX_ROWS, Math.max(PASTE_BOX_MIN_ROWS, lines + 1));
}

/** One name on one source line, before same-named rows are merged. */
interface PasteRow {
  name: string;
  quantity: number;
  /** 1-indexed. */
  line: number;
}

/**
 * An EFT `xN` count, made safe to appraise with. `parseEftFit` hands back
 * whatever `N` the text held, and a hand-edited "Nanite Repair Paste x0" is
 * legal to it; this entry's quantity is promised to be >= 1, and a zero would
 * also escape into a Shared Appraisal, whose stored snapshot refuses a
 * non-positive count. A count that isn't a positive
 * whole number is read the way the loose parser reads an unusable one — as
 * one of the thing — rather than dropping the line, which would hide it from
 * the unmatched list too.
 */
function countOf(quantity: number): number {
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

/**
 * One row per non-blank line, read as inventory copy, multibuy or a bare name.
 * A line whose quantity cannot be read comes back separately, as its own text.
 */
function itemRows(text: string): { rows: PasteRow[]; unreadable: PasteRow[] } {
  const rows: PasteRow[] = [];
  const unreadable: PasteRow[] = [];
  const lines = text.split(LINE_BREAK);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    const parsed = parseLine(trimmed);
    if ('unreadable' in parsed) unreadable.push({ name: trimmed, quantity: 1, line: i + 1 });
    else rows.push({ name: parsed.name, quantity: parsed.quantity, line: i + 1 });
  }
  return { rows, unreadable };
}

/**
 * One row per priceable thing in an EFT fit: the hull, then every module, rig,
 * charge, drone and cargo line.
 *
 * `parseEftFit`'s own parse errors — a malformed header, an unreadable body
 * line — become rows too, carrying the offending text. Nothing in the market
 * catalogue is spelled like a broken header, so each one surfaces in the
 * panel's unmatched-lines list against the line the pilot can go and fix,
 * honouring the settled rule that an unmatched line is always reported rather
 * than silently dropped (see
 * docs/context/decisions/20260908-164742-appraisal-prices-at-a-trade-hub-and-shares.md).
 * A header with no ship name in it yields an error but no hull, so the reader
 * gets that one complaint rather than a blank-named row beside it.
 *
 * Rows come back in source-line order so the panel reports a header problem
 * where the reader's eye already is — at the top — rather than after the body
 * lines that happened to parse.
 *
 * A loaded charge keeps its module line's quantity, which is the only count
 * EFT gives it: eight launchers loaded with Scourge Fury reads as eight
 * missiles. That is a rough proxy for what refilling the fit costs, not a
 * claim about how much ammo the pilot carries.
 */
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

/** Merges same-named rows (case-insensitively) into one entry each, in first-seen order. */
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

/** A pasted line whose quantity could not be read, as the text the pilot typed. */
export interface AppraisalUnreadableLine {
  name: string;
  /** 1-indexed source lines carrying exactly this text. */
  lines: number[];
}

/**
 * Parse pasted item text, and say which lines had a quantity it could not read.
 * Those lines are left out of `entries`: the caller reports them rather than
 * pricing them as one of the thing. Never throws.
 */
export function parseAppraisalPasteDetailed(text: string): {
  entries: AppraisalPasteEntry[];
  unreadable: AppraisalUnreadableLine[];
} {
  if (looksLikeEftFit(text)) return { entries: mergeRows(eftRows(text)), unreadable: [] };
  const { rows, unreadable } = itemRows(text);
  return {
    entries: mergeRows(rows),
    unreadable: mergeRows(unreadable).map(({ name, lines }) => ({ name, lines })),
  };
}

/**
 * Parse pasted item text into entries. Never throws. A line whose quantity
 * can't be read is left out here; `parseAppraisalPasteDetailed` says which.
 */
export function parseAppraisalPaste(text: string): AppraisalPasteEntry[] {
  return parseAppraisalPasteDetailed(text).entries;
}

/**
 * The paste with every line naming `itemName` taken out, line endings of what
 * stays untouched — what the Appraisal's row "Remove" does to the text box.
 * Names are compared the way the catalogue does (trimmed, case-insensitive).
 * Answers the text unchanged when no line names the item, and null for an EFT
 * fit: its lines are a hull, slots and charges, so deleting "one item" from it
 * would break the fit rather than shorten a list.
 */
export function removeItemFromPaste(text: string, itemName: string): string | null {
  if (looksLikeEftFit(text)) return null;
  const target = itemName.trim().toLowerCase();
  const entry = parseAppraisalPaste(text).find((e) => e.name.trim().toLowerCase() === target);
  if (!entry) return text;

  const removed = new Set(entry.lines);
  // Odd indexes are the line breaks the split kept, so each line owns the break after it.
  const parts = text.split(/(\r\n|\r|\n)/);
  let kept = '';
  for (let i = 0; i < parts.length; i += 2) {
    if (removed.has(i / 2 + 1)) continue;
    kept += parts[i] + (parts[i + 1] ?? '');
  }
  // Dropping the last line leaves the break before it hanging.
  return /(\r\n|\r|\n)$/.test(text) ? kept : kept.replace(/(\r\n|\r|\n)$/, '');
}
