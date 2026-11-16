import { useMemo, useState, type ReactNode } from 'react';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { CorpBookView } from '../corpBookView';
import { useNotPaying } from './notPaying';
import { ProblemFacts } from './ProblemFacts';
import { ResolveDialog } from './ResolveDialog';
import type { ResolveTarget } from './targets';

interface Args {
  corpView: CorpBookView | null;
  /** A tracked Character's name, for the mail. */
  nameOf: (characterId: number) => string;
  reloadCorpBooks: () => void;
  onPay: (corporationId: number) => void;
  /** Opens a book day's own row (its Conflict takeover lives there). */
  onOpenDay: (row: BookRowView) => void;
}

/**
 * The Tax tab's Resolve dialog (resolving in the app): which problem it is open on, the dialog
 * itself, and the member's own "Not paying" set it hides problems under.
 */
export function useResolve({ corpView, nameOf, reloadCorpBooks, onPay, onOpenDay }: Args): {
  open: (target: ResolveTarget) => void;
  hidden: ReadonlySet<string>;
  show: (key: string) => void;
  dialog: ReactNode;
} {
  const [target, setTarget] = useState<ResolveTarget | null>(null);
  const { hidden, hide, show } = useNotPaying();
  const dialog = useMemo(() => {
    if (!target) return null;
    const { problem } = target;
    const book = corpView?.books.find((b) => b.loaded.corporationId === problem.corporationId);
    const close = () => setTarget(null);
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
        {...(target.payeeName !== undefined ? { payeeName: target.payeeName } : {})}
        facts={<ProblemFacts target={target} />}
        hideKey={target.hideKey}
        onHide={hide}
        onPay={() => {
          close();
          onPay(problem.corporationId);
        }}
        {...(problem.kind === 'conflict' && problem.row
          ? {
              onFixRecords: () => {
                close();
                onOpenDay(problem.row!);
              },
            }
          : {})}
        onSent={reloadCorpBooks}
        onClose={close}
      />
    );
  }, [target, corpView, nameOf, hide, onPay, onOpenDay, reloadCorpBooks]);
  return { open: setTarget, hidden, show: (key) => void show(key), dialog };
}
