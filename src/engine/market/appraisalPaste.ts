/**
 * Parse a pasted stack of items into name + quantity entries, for the Market
 * page's **Appraisal** tab. Pure text-structure parse only — no typeID
 * resolution and no prices here; `appraisal.ts` does the arithmetic once a
 * caller has resolved names against the market catalogue.
 *
 * Accepts the three shapes a pilot actually has on their clipboard:
 *
 * - **Inventory copy** — `Name<tab>Qty`, and the wider `Name<tab>Qty<tab>Group
 *   <tab>Volume` EVE gives when the inventory is in details mode. Everything
 *   past the second field is dropped.
 * - **Multibuy** — `Name Qty`, space-separated.
 * - **A bare name**, which counts as one.
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

export interface AppraisalPasteEntry {
  /** As written, in the first spelling seen. Matching is the caller's job. */
  name: string;
  /** Always >= 1. */
  quantity: number;
  /** 1-indexed source lines this entry came from, in the order they appear. */
  lines: number[];
}

/** A trailing `xN` count, the same suffix `engine/import/eftFit.ts` reads. */
const X_SUFFIX = /^(.*\S)\s+x([\d,]+)$/i;

/** A trailing standalone number: digits and thousands separators, nothing else. */
const TRAILING_QUANTITY = /^(.*\S)\s+([\d,]+)$/;

/**
 * `124,500` -> 124500. Answers null for anything that is not a positive whole
 * number, which is what makes a non-quantity fall back to "one of these"
 * rather than silently appraising a stack as empty.
 */
function parseQuantity(raw: string): number | null {
  const digits = raw.replace(/,/g, '').trim();
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Splits one non-blank line into its name and quantity. Never fails. */
function parseLine(text: string): { name: string; quantity: number } {
  if (text.includes('\t')) {
    const [name, quantity] = text.split('\t');
    const trimmedName = name.trim();
    // A tab-led line with nothing before the tab is not a name; keep the
    // whole line so it surfaces as unmatched rather than vanishing.
    if (trimmedName === '') return { name: text.trim(), quantity: 1 };
    return { name: trimmedName, quantity: parseQuantity(quantity ?? '') ?? 1 };
  }

  const xMatch = X_SUFFIX.exec(text);
  if (xMatch) {
    const quantity = parseQuantity(xMatch[2]);
    if (quantity !== null) return { name: xMatch[1], quantity };
  }

  const trailing = TRAILING_QUANTITY.exec(text);
  if (trailing) {
    const quantity = parseQuantity(trailing[2]);
    if (quantity !== null) return { name: trailing[1], quantity };
  }

  return { name: text, quantity: 1 };
}

/** Parse pasted item text. Never throws — an unreadable line becomes a name. */
export function parseAppraisalPaste(text: string): AppraisalPasteEntry[] {
  const entries: AppraisalPasteEntry[] = [];
  const byName = new Map<string, AppraisalPasteEntry>();

  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;

    const { name, quantity } = parseLine(trimmed);
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.lines.push(i + 1);
      continue;
    }
    const entry: AppraisalPasteEntry = { name, quantity, lines: [i + 1] };
    byName.set(key, entry);
    entries.push(entry);
  }

  return entries;
}
