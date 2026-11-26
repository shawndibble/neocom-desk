import type { RequestLine } from './requests';

export interface AskToCopyOffer {
  source: string;
  typeId: number;
  runs: number;
  memberUid?: string;
  communities: readonly { id: string; name: string }[];
}

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

export function askToCopyPrefill(
  offer: AskToCopyOffer,
  blueprintName: string
): { lines: RequestLine[] } {
  return {
    lines: [{ typeId: offer.typeId, name: blueprintName, quantity: 1, kind: 'bpc' }],
  };
}
