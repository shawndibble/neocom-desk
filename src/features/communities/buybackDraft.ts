/**
 * The compose form's buyback fields (issue #4780) as typed text and ticks,
 * and the step back and forth between them and a `StandingRequest`. Pure.
 */
import {
  BUYBACK_GROUP_KEYS,
  MAX_BUY_LINES,
  parseRate,
  type BuybackGroup,
  type BuybackHubId,
  type BuybackLine,
  type RateBasis,
  type StandingRequest,
} from '@/engine/communities/buyback';

export interface BuybackDraft {
  /** The rate as typed: "90", "92,5" or "92.5 %". */
  rate: string;
  rateBasis: RateBasis;
  hubId: BuybackHubId;
  /** Null means the requester's own Character. */
  buyerCharacterId: number | null;
  groups: BuybackGroup[];
  types: { typeId: number; name: string }[];
}

export const emptyBuybackDraft = (): BuybackDraft => ({
  rate: '90',
  rateBasis: 'buy',
  hubId: 'jita',
  buyerCharacterId: null,
  groups: [],
  types: [],
});

/** The standing Request a draft describes, or null while the rate or the buy list is not valid. */
export function draftToStanding(draft: BuybackDraft): StandingRequest | null {
  const rate = parseRate(draft.rate);
  if (rate === null) return null;
  const buyLines: BuybackLine[] = [
    // Group order follows the table, so the same ticks always make the same Request.
    ...BUYBACK_GROUP_KEYS.filter((g) => draft.groups.includes(g)).map((group): BuybackLine => ({
      kind: 'group',
      group,
    })),
    ...draft.types.map((t): BuybackLine => ({ kind: 'type', typeId: t.typeId, name: t.name })),
  ];
  if (buyLines.length === 0 || buyLines.length > MAX_BUY_LINES) return null;
  return {
    rate,
    rateBasis: draft.rateBasis,
    hubId: draft.hubId,
    buyerCharacterId: draft.buyerCharacterId,
    buyLines,
  };
}

export function draftFromStanding(standing: StandingRequest): BuybackDraft {
  return {
    rate: String(standing.rate),
    rateBasis: standing.rateBasis,
    hubId: standing.hubId,
    buyerCharacterId: standing.buyerCharacterId,
    groups: standing.buyLines.flatMap((l) => (l.kind === 'group' ? [l.group] : [])),
    types: standing.buyLines.flatMap((l) =>
      l.kind === 'type' ? [{ typeId: l.typeId, name: l.name }] : []
    ),
  };
}

export const toggleGroup = (draft: BuybackDraft, group: BuybackGroup): BuybackDraft => ({
  ...draft,
  groups: draft.groups.includes(group)
    ? draft.groups.filter((g) => g !== group)
    : [...draft.groups, group],
});

export const addType = (
  draft: BuybackDraft,
  type: { typeId: number; name: string }
): BuybackDraft =>
  draft.types.some((t) => t.typeId === type.typeId)
    ? draft
    : { ...draft, types: [...draft.types, type] };

export const removeType = (draft: BuybackDraft, typeId: number): BuybackDraft => ({
  ...draft,
  types: draft.types.filter((t) => t.typeId !== typeId),
});
