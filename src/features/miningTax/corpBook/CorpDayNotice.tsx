import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { ClosedDayConflictNotice } from './ClosedDayConflict';
import { closedConflictPayees, type ConflictNames } from './closedConflicts';
import { CorpDisputeAction } from './CorpDisputeAction';
import { CorpOverlapNotice } from './CorpOverlapNotice';
import type { MailContext } from './resolve/resolveSubmit';
import { conflictTarget, type ResolveTarget } from './resolve/targets';
import { resolvesOn } from './useCorpStateText';

interface Props {
  view: BookRowView;
  corpName: string;
  recordedAt: string;
  siblings?: readonly BookRowView[];
  closedConflict?: ClosedDayPlan;
  names: ConflictNames;
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  mail: MailContext;
  onBookChanged: () => void;
  onFix: (plan: ClosedDayPlan) => void;
  onResolve: (target: ResolveTarget) => void;
}

export function CorpDayNotice({
  view,
  corpName,
  recordedAt,
  siblings,
  closedConflict,
  names,
  everyAssignment,
  payeeById,
  mail,
  onBookChanged,
  onFix,
  onResolve,
}: Props) {
  const { t } = useTranslation();
  if (closedConflict) {
    const payees = closedConflictPayees(closedConflict, names);
    const contested = view.state === 'conflict';
    return (
      <ClosedDayConflictNotice
        plan={closedConflict}
        names={names}
        {...(contested && view.resolvesAt
          ? {
              countsFrom: t('miningTax.corpBook.conflict.countsFrom', {
                corp: corpName,
                date: resolvesOn(view.resolvesAt),
              }),
            }
          : {})}
        onFix={() => onFix(closedConflict)}
        onResolve={() => onResolve(conflictTarget(view, payees, closedConflict))}
        {...(contested && {
          disputeAction: (
            <CorpDisputeAction view={view} payeeName={payees} onSent={onBookChanged} mail={mail} />
          ),
        })}
      />
    );
  }
  if (!view.overlap && view.state !== 'conflict') return null;
  return (
    <CorpOverlapNotice
      view={view}
      corpName={corpName}
      recordedAt={recordedAt}
      {...(siblings ? { siblings } : {})}
      everyAssignment={everyAssignment}
      payeeById={payeeById}
      onBookChanged={onBookChanged}
      mail={mail}
      onResolve={onResolve}
    />
  );
}
