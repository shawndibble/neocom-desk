/**
 * The Appraisal's campaign turn-ins (issue #6706): which pasted rows an Active
 * Campaign Objective takes, what each pays against selling it now, and the
 * pile whose Turn-in Reward beats Sell now (the facts row's Turn in total and
 * `TurnInBreakdown`).
 *
 * The LP in a reward is counted at the Appraisal's hub, the same hub its LP
 * Value is read at. The active Character's own contribution counts against an
 * objective's per-Character cap once its Participate read answers.
 *
 * A Turn-in Reward is never a price: nothing here feeds the Buy/Sell totals
 * (scope decision 20261123-164921).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppraisalRow, RefineBasis } from '@/engine/market/appraisal';
import {
  appraisalRowTurnIn,
  type AppraisalRowTurnIn,
  type AppraisalTurnInLookup,
} from '@/engine/market/appraisalSellGroups';
import { groupTurnInPile } from '@/engine/market/turnInPile';
import type { TurnInBreakdownItem } from '@/features/campaigns/TurnInBreakdown';
import {
  useParticipation,
  useTurnInOffers,
  type TurnInOfferDetail,
} from '@/features/campaigns/useTurnIns';
import { formatIskCompact } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';

export type RowTurnIn = AppraisalRowTurnIn<TurnInOfferDetail>;

export interface AppraisalTurnIns {
  /** For the copy lists' `turnIn` group; null until the offers load (or when none can be read). */
  lookup: AppraisalTurnInLookup<TurnInOfferDetail> | null;
  /** The row's turn-in against Sell now; null without an Active offer. */
  rowTurnIn: (row: AppraisalRow) => RowTurnIn | null;
  /** Some pasted row has an Active offer: the Turn in column earns its place. */
  any: boolean;
  /** The rows turning in beats selling, for `TurnInBreakdown`. */
  pile: TurnInBreakdownItem[];
  /** The pile's Turn-in Reward; 0 when nothing beats selling. */
  total: number;
}

const NO_ROWS: readonly AppraisalRow[] = [];

export function useAppraisalTurnIns({
  rows = NO_ROWS,
  hub,
  characterId,
  refineBasis,
}: {
  rows?: readonly AppraisalRow[];
  hub: TradeHub;
  characterId: number | null;
  refineBasis: RefineBasis;
}): AppraisalTurnIns {
  const { t } = useTranslation();
  const offers = useTurnInOffers(hub);
  const offerFor = offers.status === 'ready' ? offers.data.offerFor : null;
  const any = offerFor !== null && rows.some((row) => offerFor(row.typeId) !== null);
  // Read only once something pasted can be turned in.
  const participation = useParticipation(any ? characterId : null);
  const contributedTo =
    participation.status === 'ready' ? participation.data.contributedTo : undefined;

  const lookup = useMemo(
    () => (offerFor === null ? null : { offerFor, contributedTo }),
    [offerFor, contributedTo]
  );
  const rowTurnIn = useCallback(
    (row: AppraisalRow) => (lookup === null ? null : appraisalRowTurnIn(row, refineBasis, lookup)),
    [lookup, refineBasis]
  );
  const pile = useMemo(
    () =>
      rows.flatMap((row): TurnInBreakdownItem[] => {
        const turnIn = rowTurnIn(row);
        if (turnIn === null || !turnIn.beats) return [];
        return [
          {
            name: row.name,
            quantity: row.quantity,
            offer: turnIn.offer,
            contributed: contributedTo?.(turnIn.offer.objectiveId) ?? undefined,
            note: t('market.appraisal.turnIn.overSellNow', {
              amount: formatIskCompact(turnIn.over),
            }),
          },
        ];
      }),
    [rows, rowTurnIn, contributedTo, t]
  );
  const total = useMemo(() => groupTurnInPile(pile).total, [pile]);
  return { lookup, rowTurnIn, any, pile, total };
}
