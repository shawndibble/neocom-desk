/**
 * Where a page-level paste belongs (the app-wide paste router,
 * `app/GlobalPasteRouter.tsx`): an EFT fit opens in Fittings, an item list —
 * an inventory copy, a multibuy, a contract's contents — in the Appraisal,
 * a blueprint list in a new Build Group, a Local list or D-Scan in Pilot Lookup, an in-game chat link on the item or
 * system page it names, and anything else is left alone.
 *
 * Destinations live in one registry, `PASTE_DETECTORS`. Its order IS the
 * priority: the first detector to claim a paste wins, so a new format goes
 * where it cannot hijack an earlier one. Adding a destination = its id in
 * `PasteDestination`, one entry here, one route in `GlobalPasteRouter` (the
 * typecheck flags a missing one), and its Help strings.
 *
 * Deliberately conservative, since the router acts on pastes the pilot never
 * aimed at a field: a fit needs a header naming a real hull, and an item list
 * needs most of its lines to be real item names. A pasted URL, a chat line or
 * a sentence that happens to start with "Tritanium" stays a no-op.
 */
import { parseChatLink } from '@/engine/import/chatLink';
import { looksLikeBlueprintList } from '@/engine/import/blueprintList';
import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { matchAppraisalEntries, type AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { classifyPilotPaste } from '@/engine/pilotList/parsePilotPaste';

export type PasteDestination =
  'fitting' | 'chatLink' | 'dscan' | 'blueprintList' | 'appraisal' | 'pilotList';

export interface PasteSources {
  /** The market catalogue, keyed by lower-case item name. */
  catalogue: AppraisalCatalogue;
  /** Lower-case names of every hull — the only thing an EFT header may name. */
  hullNames: ReadonlySet<string>;
  /**
   * Lower-case name of every blueprint and reaction formula, buildable or not.
   * Absent (or empty) means no blueprint list can be recognised.
   */
  blueprintNames?: ReadonlySet<string>;
}

/**
 * What a detector makes of a paste: `match` claims it, `veto` ends detection
 * with no destination (the text is unmistakably this format but unusable —
 * lower-priority detectors must not reinterpret it), `pass` defers to the next.
 */
export type PasteVerdict = 'match' | 'veto' | 'pass';

export interface PasteDetector<Id extends string = PasteDestination> {
  id: Id;
  detect: (text: string, sources: PasteSources) => PasteVerdict;
}

/**
 * Every destination, highest priority first. The Help page lists them in this
 * order, with its strings under `shortcuts.pasteDestinations.<id>`.
 */
export const PASTE_DETECTORS: readonly PasteDetector[] = [
  {
    id: 'fitting',
    detect: (text, { hullNames }) => {
      if (!looksLikeEftFit(text)) return 'pass';
      // A bracketed first line is a fit or nothing: reading a malformed one as
      // loose items would appraise the pilot's fit body under a broken header.
      const shipName = parseEftFit(text).shipName.trim().toLowerCase();
      return shipName !== '' && hullNames.has(shipName) ? 'match' : 'veto';
    },
  },
  {
    // A `showinfo:` link is unmistakable, so it outranks the list readers.
    id: 'chatLink',
    detect: (text) => (parseChatLink(text) === null ? 'pass' : 'match'),
  },
  {
    // Ahead of the item list: a D-Scan's rows also read as `Name<tab>...`, but
    // every one starting with a numeric type id is unmistakably a scan.
    id: 'dscan',
    detect: (text) => (classifyPilotPaste(text)?.kind === 'dscan' ? 'match' : 'pass'),
  },
  {
    // Ahead of the item list, which a blueprint list also reads as: most
    // lines being blueprints makes it a Build Group, never an appraisal.
    id: 'blueprintList',
    detect: (text, { blueprintNames }) =>
      blueprintNames && looksLikeBlueprintList(text, blueprintNames) ? 'match' : 'pass',
  },
  {
    id: 'appraisal',
    detect: (text, { catalogue }) => {
      const entries = parseAppraisalPaste(text);
      if (entries.length === 0) return 'pass';
      const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);
      // A strict majority: a list the pilot copied out of the game rarely has
      // more than a stray unknown line, while prose rarely has more than one hit.
      return matched.length > unmatched.length ? 'match' : 'pass';
    },
  },
  {
    // Last, so an item list never reads as pilot names: two or more lines that
    // all look like names (a Local list).
    id: 'pilotList',
    detect: (text) => (classifyPilotPaste(text)?.kind === 'local' ? 'match' : 'pass'),
  },
];

/** The first detector to claim `text`, or null when none is confident. */
export function detectPasteDestination<Id extends string>(
  text: string,
  sources: PasteSources,
  detectors: readonly PasteDetector<Id>[]
): Id | null {
  if (text.trim() === '') return null;
  for (const { id, detect } of detectors) {
    const verdict = detect(text, sources);
    if (verdict === 'match') return id;
    if (verdict === 'veto') return null;
  }
  return null;
}

export function pasteDestination(text: string, sources: PasteSources): PasteDestination | null {
  return detectPasteDestination(text, sources, PASTE_DETECTORS);
}
