/**
 * Where a page-level paste belongs (the app-wide paste router,
 * `app/GlobalPasteRouter.tsx`): an EFT fit opens in Fittings, an item list —
 * an inventory copy, a multibuy, a contract's contents — in the Appraisal,
 * a Local list or D-Scan in Pilot Lookup, and anything else is left alone.
 *
 * Deliberately conservative, since the router acts on pastes the pilot never
 * aimed at a field: a fit needs a header naming a real hull, and an item list
 * needs most of its lines to be real item names. A pasted URL, a chat line or
 * a sentence that happens to start with "Tritanium" stays a no-op.
 */
import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { matchAppraisalEntries, type AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { classifyPilotPaste } from '@/engine/pilotList/parsePilotPaste';

export type PasteDestination = 'fitting' | 'appraisal' | 'pilotList';

export interface PasteSources {
  /** The market catalogue, keyed by lower-case item name. */
  catalogue: AppraisalCatalogue;
  /** Lower-case names of every hull — the only thing an EFT header may name. */
  hullNames: ReadonlySet<string>;
}

export function pasteDestination(
  text: string,
  { catalogue, hullNames }: PasteSources
): PasteDestination | null {
  if (text.trim() === '') return null;

  if (looksLikeEftFit(text)) {
    // A bracketed first line is a fit or nothing: reading a malformed one as
    // loose items would appraise the pilot's fit body under a broken header.
    const shipName = parseEftFit(text).shipName.trim().toLowerCase();
    return shipName !== '' && hullNames.has(shipName) ? 'fitting' : null;
  }

  const entries = parseAppraisalPaste(text);
  if (entries.length > 0) {
    const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);
    // A strict majority: a list the pilot copied out of the game rarely has
    // more than a stray unknown line, while prose rarely has more than one hit.
    if (matched.length > unmatched.length) return 'appraisal';
  }

  // Last, so an item list never reads as pilot names: two or more lines that
  // all look like names (Local), or all like D-Scan rows.
  return classifyPilotPaste(text) === null ? null : 'pilotList';
}
