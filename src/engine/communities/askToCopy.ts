/**
 * "Ask <name> to copy" (issue #3813): a Shared BPO on a Community Offer row of
 * BPC Sourcing becomes a Request for one copy of that blueprint. Pure: the dialog is `AskToCopyDialog`.
 */
import type { RequestLine } from './requests';

/** The part of a BPC Sourcing row this needs; a `BpcSearchRow` satisfies it. */
export interface AskToCopyOffer {
  source: string;
  typeId: number;
  /** -1 is an original (BPO); anything else is a copy. */
  runs: number;
  memberUid?: string;
  communities: readonly { id: string; name: string }[];
}

/**
 * Only a Shared BPO from a Community Offer: a copy is "from <name>" (not
 * something to copy), and a reaction formula cannot be copied at all
 * (GLOSSARY Community Offer). Formulas not known yet (`null`) is not allowed.
 */
export function canAskToCopy(
  offer: AskToCopyOffer,
  reactionFormulaTypeIds: ReadonlySet<number> | null
): boolean {
  return (
    offer.source === 'community' &&
    offer.runs === -1 &&
    !!offer.memberUid &&
    offer.communities.length > 0 &&
    reactionFormulaTypeIds !== null &&
    !reactionFormulaTypeIds.has(offer.typeId)
  );
}

/** What compose starts with: one BPC line, quantity 1, no runs/ME/TE ask. */
export function askToCopyPrefill(
  offer: AskToCopyOffer,
  blueprintName: string
): { lines: RequestLine[] } {
  return {
    lines: [{ typeId: offer.typeId, name: blueprintName, quantity: 1, kind: 'bpc' }],
  };
}
