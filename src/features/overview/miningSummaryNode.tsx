import type { ReactNode } from 'react';
import { Trans } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import type { MiningTaxBoardData } from './boardData';

/** `miningTaxSummary`'s visible form: the owed ISK as an `IskAmount` (§6c), else the plain string. */
export function miningTaxSummaryNode(data: MiningTaxBoardData | null): ReactNode {
  if (data === null || data.needsReauth || data.unpaidIsk <= 0) return undefined;
  return (
    <Trans
      i18nKey="overview.board.miningUnpaidRich"
      components={{ isk: <IskAmount value={data.unpaidIsk} decimals={0} /> }}
    />
  );
}
