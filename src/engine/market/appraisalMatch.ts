/**
 * Resolve pasted item names against the market catalogue, splitting a paste
 * into the entries that name a real tradeable type and the ones that do not.
 *
 * Pure, and takes the catalogue as a plain map so the SDE loader stays on the
 * caller's side of the engine boundary (`features/market/appraisalData.ts`
 * builds the map from `sde/loadMarketSde`).
 *
 * The catalogue is keyed lower-case and the pasted name is lower-cased to
 * match, so a name typed in caps still resolves — but the *catalogue's*
 * spelling is what comes out, so the table reads the way the item is actually
 * called rather than however it happened to be pasted.
 *
 * An unmatched name keeps every source line it appeared on, because the panel
 * reports it by line number to a reader who is looking at their own paste.
 */
import type { AppraisalPasteEntry } from './appraisalPaste';

export interface AppraisalMatch {
  typeId: number;
  /** The catalogue's own spelling. */
  name: string;
  quantity: number;
}

export interface AppraisalUnmatched {
  /** As pasted — this is what the reader has to go and fix. */
  name: string;
  /** 1-indexed source lines, in the order they appear. */
  lines: number[];
}

export interface AppraisalMatchResult {
  matched: AppraisalMatch[];
  unmatched: AppraisalUnmatched[];
}

/** A market catalogue keyed by lower-case item name. */
export type AppraisalCatalogue = ReadonlyMap<string, { typeId: number; name: string }>;

export function matchAppraisalEntries(
  entries: readonly AppraisalPasteEntry[],
  catalogue: AppraisalCatalogue
): AppraisalMatchResult {
  const matched: AppraisalMatch[] = [];
  const unmatched: AppraisalUnmatched[] = [];

  for (const entry of entries) {
    const name = entry.name.trim();
    const type = catalogue.get(name.toLowerCase());
    if (type) {
      matched.push({ typeId: type.typeId, name: type.name, quantity: entry.quantity });
    } else {
      unmatched.push({ name, lines: entry.lines });
    }
  }

  return { matched, unmatched };
}
