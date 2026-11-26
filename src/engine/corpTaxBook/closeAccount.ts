import type { Miner } from './charges';
import {
  FORFEIT_NO_REPLY_DAYS,
  forfeitAllowed,
  type ForfeitBasis,
} from '../../../functions/src/corpTaxBookEngine';
import { bookMiner, type BookView } from './bookView';
import { finalNoticeId, type LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import { draftNotice } from './lateNotices';

export { FORFEIT_NO_REPLY_DAYS, forfeitAllowed, type ForfeitBasis };

export type CreditDisposition =
  { kind: 'refund' } | ({ kind: 'forfeit' } & { basis: ForfeitBasis });

export function mailableAfterClose(
  miner: Pick<Miner, 'closedAt' | 'finalStatementId'> | undefined,
  notice: Pick<LateNotice, 'id' | 'issuedAt'>
): boolean {
  if (!miner?.closedAt) return true;
  return notice.id === miner.finalStatementId || notice.issuedAt <= miner.closedAt;
}

export interface ClosePlan {
  notice?: LateNotice;
  owedAfter: number;
  creditAfter: number;
  pendingTax: number;
}

export function planCloseAccount(view: BookView, minerId: string): ClosePlan | undefined {
  const row = bookMiner(view, minerId)?.row;
  if (!row) return undefined;
  const plan = draftNotice(view, minerId, { id: finalNoticeId(minerId), kind: 'final' });
  return {
    pendingTax: row.pending,
    ...(plan && plan.notice.lines.length > 0 ? { notice: plan.notice } : {}),
    owedAfter: row.owed,
    creditAfter: row.credit,
  };
}
