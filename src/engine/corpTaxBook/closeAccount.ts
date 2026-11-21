/**
 * Guest close-account (epic #4055, issue #4184). An officer closes a guest's
 * account: a final late notice asks for the unpaid days no notice listed, then late notice mail
 * stops for that Miner. Credit is refunded by default; it is forfeited only
 * with the guest's recorded consent, or after 90 days with no reply.
 * The callables enforce `forfeitAllowed` through a mirror
 * (functions/src/corpTaxBookEngine.ts); functionsMirror.test.ts keeps them equal.
 */
import type { Miner } from './charges';
import {
  FORFEIT_NO_REPLY_DAYS,
  forfeitAllowed,
  type ForfeitBasis,
} from '../../../functions/src/corpTaxBookEngine';
import type { BookView } from './bookView';
import { finalNoticeId, type LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import { draftNotice } from './lateNotices';

/** When a guest's credit may be forfeited: the shared rule (functions/src/corpTaxBookEngine.ts). */
export { FORFEIT_NO_REPLY_DAYS, forfeitAllowed, type ForfeitBasis };

/** What happens to the guest's credit when the account closes. Refund is the default. */
export type CreditDisposition =
  { kind: 'refund' } | ({ kind: 'forfeit' } & { basis: ForfeitBasis });

/**
 * Late notice mail stops once the account is closed: the final notice and any issued before the
 * close still go out; nothing issued later does.
 */
export function mailableAfterClose(
  miner: Pick<Miner, 'closedAt' | 'finalStatementId'> | undefined,
  notice: Pick<LateNotice, 'id' | 'issuedAt'>
): boolean {
  if (!miner?.closedAt) return true;
  return notice.id === miner.finalStatementId || notice.issuedAt <= miner.closedAt;
}

export interface ClosePlan {
  /** The final late notice: the unpaid days no notice listed; absent when there are none. */
  notice?: LateNotice;
  /** Still owed once the account closes. */
  owedAfter: number;
  /** Credit left to refund. */
  creditAfter: number;
  /** Tax on days that are not Billable yet: never billed once the account is closed. */
  pendingTax: number;
}

/**
 * What closing a Miner's account would do now. The account owes its days already: the final
 * notice changes neither what is owed nor the credit.
 */
export function planCloseAccount(view: BookView, minerId: string): ClosePlan | undefined {
  const row = view.miners.find((m) => m.id === minerId);
  if (!row || !view.internals.byMiner.has(minerId)) return undefined;
  const plan = draftNotice(view, minerId, { id: finalNoticeId(minerId), kind: 'final' });
  return {
    pendingTax: row.pending,
    ...(plan && plan.notice.lines.length > 0 ? { notice: plan.notice } : {}),
    owedAfter: row.owed,
    creditAfter: row.credit,
  };
}
