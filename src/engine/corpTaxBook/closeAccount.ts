/**
 * Guest close-account (epic #4055, issue #4184). An officer closes a guest's
 * account: a final Statement bills everything Billable, then Statement mail
 * stops for that Miner. Credit is refunded by default; it is forfeited only
 * with the guest's recorded consent, or after 90 days with no reply.
 * The callables enforce `forfeitAllowed` through a mirror
 * (functions/src/corpTaxBookEngine.ts); functionsMirror.test.ts keeps them equal.
 */
import { shiftDate } from '../miningTax/yieldRange';
import type { Miner } from './charges';
import type { BookView } from './bookView';
import { paymentCode } from './bookView';
import { issueStatement, type Statement } from './statements';

/** A guest's credit is forfeited without consent only after this many days with no reply. */
export const FORFEIT_NO_REPLY_DAYS = 90;

export type ForfeitBasis =
  { kind: 'consent'; note: string } | { kind: 'no-reply'; askedAt: string };

/** What happens to the guest's credit when the account closes. Refund is the default. */
export type CreditDisposition =
  { kind: 'refund' } | ({ kind: 'forfeit' } & { basis: ForfeitBasis });

/** Consent is recorded in words, or 90 full days have passed since the guest was asked. */
export function forfeitAllowed(basis: ForfeitBasis, today: string): boolean {
  if (basis.kind === 'consent') return basis.note.trim().length > 0;
  return basis.askedAt <= shiftDate(today, -FORFEIT_NO_REPLY_DAYS);
}

/**
 * Statement mail stops after the final Statement (epic): the final one and any
 * issued before the close still go out; nothing issued later does.
 */
export function mailableAfterClose(
  miner: Pick<Miner, 'closedAt' | 'finalStatementId'> | undefined,
  statement: Pick<Statement, 'id' | 'issuedAt'>
): boolean {
  if (!miner?.closedAt) return true;
  return statement.id === miner.finalStatementId || statement.issuedAt <= miner.closedAt;
}

export interface ClosePlan {
  /** The final Statement, absent when nothing Billable is left to bill. */
  statement?: Statement & { characterIds: number[] };
  /** Still owed once the final Statement is counted (credit applied). */
  owedAfter: number;
  /** Credit left to refund once the final Statement is counted. */
  creditAfter: number;
  /** Tax on days that are not Billable yet: never billed once the account is closed. */
  pendingTax: number;
}

/** What closing a Miner's account would do now. */
export function planCloseAccount(view: BookView, minerId: string): ClosePlan | undefined {
  const row = view.miners.find((m) => m.id === minerId);
  const inner = view.internals.byMiner.get(minerId);
  if (!row || !inner) return undefined;
  const { draft } = inner;
  const base = { pendingTax: row.pending };
  if (draft.kind !== 'statement') {
    return { ...base, owedAfter: row.owed, creditAfter: row.credit };
  }
  const id = `final_${minerId}`.replace(/[^A-Za-z0-9_:-]/g, '_');
  const statement = issueStatement(draft, {
    id,
    code: paymentCode(id),
    minerId,
    period: { start: draft.coversFrom, end: draft.coversThrough },
    issuedAt: view.input.now,
    hubId: view.input.hubId,
    oreForm: view.input.oreForm,
  });
  return {
    ...base,
    statement: { ...statement, characterIds: row.characterIds },
    owedAfter: Math.max(0, row.owed + draft.amount - row.credit),
    creditAfter: Math.max(0, row.credit - row.owed - draft.amount),
  };
}
