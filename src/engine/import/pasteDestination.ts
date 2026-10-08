/**
 * Where a page-level paste belongs (the app-wide paste router,
 * `app/GlobalPasteRouter.tsx`): an EFT fit opens in Fittings, an item list —
 * an inventory copy, a multibuy, a contract's contents — in the Appraisal, a
 * skill plan (in-game or EVEMon text) in the Skills planner, and anything else
 * is left alone.
 *
 * Deliberately conservative, since the router acts on pastes the pilot never
 * aimed at a field: a fit needs a header naming a real hull, and an item list
 * needs most of its lines to be real item names, and a skill plan needs
 * *every* line to be a real skill at a level 1-5. A pasted URL, a chat line or
 * a sentence that happens to start with "Tritanium" stays a no-op.
 */
import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';
import { parseSkillPlanPaste, type SkillCatalog } from '@/engine/import/skillPlanPaste';
import { matchAppraisalEntries, type AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';

export type PasteDestination = 'fitting' | 'appraisal' | 'skillPlan';

export interface PasteSources {
  /** The market catalogue, keyed by lower-case item name. */
  catalogue: AppraisalCatalogue;
  /** Lower-case names of every hull — the only thing an EFT header may name. */
  hullNames: ReadonlySet<string>;
  /** Skill names, lower-case — the Skills planner importer's own catalog. */
  skillByName: SkillCatalog;
}

export function pasteDestination(
  text: string,
  { catalogue, hullNames, skillByName }: PasteSources
): PasteDestination | null {
  if (text.trim() === '') return null;

  if (looksLikeEftFit(text)) {
    // A bracketed first line is a fit or nothing: reading a malformed one as
    // loose items would appraise the pilot's fit body under a broken header.
    const shipName = parseEftFit(text).shipName.trim().toLowerCase();
    return shipName !== '' && hullNames.has(shipName) ? 'fitting' : null;
  }

  // Before the Appraisal, and all-or-nothing: skill books are market items, so
  // "Gunnery 5" reads either way, but an item list brings a quantity (`x2`,
  // `500`), a price or a non-skill name that the planner's parser rejects.
  const plan = parseSkillPlanPaste(text, skillByName);
  if (plan.entries.length > 0 && plan.errors.length === 0) return 'skillPlan';

  const entries = parseAppraisalPaste(text);
  if (entries.length === 0) return null;
  const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);
  // A strict majority: a list the pilot copied out of the game rarely has
  // more than a stray unknown line, while prose rarely has more than one hit.
  return matched.length > unmatched.length ? 'appraisal' : null;
}
