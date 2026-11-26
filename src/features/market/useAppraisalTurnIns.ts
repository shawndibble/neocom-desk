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
  lookup: AppraisalTurnInLookup<TurnInOfferDetail> | null;
  rowTurnIn: (row: AppraisalRow) => RowTurnIn | null;
  any: boolean;
  pile: TurnInBreakdownItem[];
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
  const offers = useTurnInOffers(hub, rows.length > 0);
  const offerFor = offers.status === 'ready' ? offers.data.offerFor : null;
  const any = offerFor !== null && rows.some((row) => offerFor(row.typeId) !== null);
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
