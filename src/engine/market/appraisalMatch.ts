import type { AppraisalPasteEntry } from './appraisalPaste';

export interface AppraisalMatch {
  typeId: number;
  name: string;
  quantity: number;
}

export interface AppraisalUnmatched {
  name: string;
  lines: number[];
}

export interface AppraisalMatchResult {
  matched: AppraisalMatch[];
  unmatched: AppraisalUnmatched[];
}

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
