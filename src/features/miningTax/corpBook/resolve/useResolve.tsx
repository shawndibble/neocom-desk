import { useMemo, useState, type ReactNode } from 'react';
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import type { MadePayment } from '../../paymentLinks';
import { ClosedDayFixPreview } from '../ClosedDayConflict';
import type { ConflictNames } from '../closedConflicts';
import type { CorpBookView } from '../corpBookView';
import { useNotPaying } from './notPaying';
import { ProblemFacts } from './ProblemFacts';
import { ResolveDialog } from './ResolveDialog';
import { claimablePayments } from './paidTransfers';
import { proofSenders, type ResolveTarget } from './targets';

interface Args {
  corpView: CorpBookView | null;
  nameOf: (characterId: number) => string;
  reloadCorpBooks: () => void;
  madePayments: readonly MadePayment[];
  linked: ReadonlySet<string>;
  onPay: (corporationId: number) => void;
  onFixRecords: (plan: ClosedDayPlan) => void;
  names: ConflictNames;
}

export function useResolve({
  corpView,
  nameOf,
  reloadCorpBooks,
  madePayments,
  linked,
  onPay,
  onFixRecords,
  names,
}: Args): {
  open: (target: ResolveTarget) => void;
  hidden: ReadonlySet<string>;
  show: (key: string) => void;
  hide: (key: string) => void;
  dialog: ReactNode;
} {
  const [target, setTarget] = useState<ResolveTarget | null>(null);
  const { hidden, hide, show } = useNotPaying();
  const dialog = useMemo(() => {
    if (!target) return null;
    const { problem } = target;
    const book = corpView?.books.find((b) => b.loaded.corporationId === problem.corporationId);
    const close = () => setTarget(null);
    const plan = problem.kind === 'conflict' ? problem.plan : undefined;
    return (
      <ResolveDialog
        problem={problem}
        mail={{
          characterId: problem.characterId,
          memberName: nameOf(problem.characterId),
          corporationId: problem.corporationId,
          corpName: problem.corpName,
          contact: book?.loaded.taxContact,
        }}
        {...(target.transfers ? { transfers: target.transfers } : {})}
        payments={claimablePayments(madePayments, {
          bookCorporationId: problem.corporationId,
          linked,
          held: book?.loaded.payments ?? [],
        })}
        senderIds={proofSenders(book?.loaded, {
          characterId: problem.characterId,
          ...(problem.row ? { row: problem.row } : {}),
          ...(problem.kind === 'uncredited' || problem.kind === 'kept' || problem.kind === 'overdue'
            ? problem.noticeId !== undefined
              ? { noticeId: problem.noticeId }
              : {}
            : {}),
        })}
        {...(target.paidSince !== undefined ? { paidSince: target.paidSince } : {})}
        {...(target.payeeName !== undefined ? { payeeName: target.payeeName } : {})}
        facts={<ProblemFacts target={target} names={names} />}
        hideKey={target.hideKey}
        onHide={hide}
        onPay={() => {
          close();
          onPay(problem.corporationId);
        }}
        {...(plan
          ? {
              fixPreview: <ClosedDayFixPreview plan={plan} names={names} />,
              onFixRecords: () => {
                close();
                onFixRecords(plan);
              },
            }
          : {})}
        onSent={reloadCorpBooks}
        onClose={close}
      />
    );
  }, [
    target,
    corpView,
    nameOf,
    hide,
    onPay,
    onFixRecords,
    names,
    reloadCorpBooks,
    madePayments,
    linked,
  ]);
  return {
    open: setTarget,
    hidden,
    show: (key) => void show(key),
    hide: (key) => void hide(key),
    dialog,
  };
}
