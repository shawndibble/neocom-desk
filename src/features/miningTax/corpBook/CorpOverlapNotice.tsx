import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { releaseOre } from '../ledgerActions';
import { useLedgerAction } from '../useLedgerAction';
import { ConflictNotice } from './ConflictNotice';
import { planTakeover } from './conflictTakeover';
import { CorpDeclareSlot } from './CorpDeclareAction';
import { CorpDisputeAction } from './CorpDisputeAction';
import type { MailContext } from './resolve/resolveSubmit';
import { conflictTarget, type ResolveTarget } from './resolve/targets';
import { resolvesOn } from './useCorpStateText';
import { OverlapNotice } from './OverlapNotice';
import { acknowledgeOverlap, overlapAckKey, readOverlapAcks } from './overlapAck';

const NO_SIBLINGS: readonly BookRowView[] = [];

interface Props {
  view: BookRowView;
  corpName: string;
  recordedAt: string;
  siblings?: readonly BookRowView[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  typeNames: ReadonlyMap<number, string>;
  onChanged: () => void;
  onBookChanged?: () => void;
  onResolve?: (target: ResolveTarget) => void;
  mail?: MailContext;
}

export function CorpOverlapNotice({
  view,
  corpName,
  recordedAt,
  siblings = NO_SIBLINGS,
  everyAssignment,
  payeeById,
  typeNames,
  onChanged,
  onBookChanged,
  onResolve,
  mail,
}: Props) {
  const { t } = useTranslation();
  const conflict = view.state === 'conflict';
  const { pending, error, run } = useLedgerAction();
  const [acked, setAcked] = useState<Set<string> | null>(null);
  const key = overlapAckKey(view.corporationId, view.characterId, view.date, view.solarSystemId);

  useEffect(() => {
    let cancelled = false;
    void readOverlapAcks().then((held) => !cancelled && setAcked(held));
    return () => {
      cancelled = true;
    };
  }, []);

  const { mine, steps, overlap } = useMemo(
    () => planTakeover(view, siblings, everyAssignment),
    [view, siblings, everyAssignment]
  );

  const nameOf = (payeeId: string) => payeeById.get(payeeId)?.name ?? payeeId;
  const previews = steps.map((p) => ({
    payeeName: nameOf(p.assignment.payeeId ?? ''),
    before: p.before,
    after: p.after,
  }));
  const takeOver = () =>
    void run(
      () => releaseOre(steps.map((p) => ({ assignment: p.assignment, after: p.after }))),
      onChanged
    );

  const conflictPayeeName =
    [...new Set(mine.map((a) => nameOf(a.payeeId ?? '')))].join(', ') ||
    (view.ownerPayeeId !== undefined
      ? nameOf(view.ownerPayeeId)
      : t('miningTax.corpBook.conflict.otherPayee'));
  const resolveConflict = onResolve
    ? () => onResolve(conflictTarget(view, conflictPayeeName))
    : undefined;
  if (conflict) {
    return (
      <ConflictNotice
        corpName={corpName}
        cause={view.conflictCause}
        {...(view.ownerPayeeId !== undefined && { ownerName: nameOf(view.ownerPayeeId) })}
        {...(view.conflictCause === 'overListed' &&
          view.overlap?.payeeIds[0] !== undefined && {
            ownPayeeName: nameOf(view.overlap.payeeIds[0]),
          })}
        entries={mine.map((a) => ({
          id: a.id,
          payeeName: nameOf(a.payeeId ?? ''),
          taxOwed: a.taxOwed,
          paid: a.status === 'paid',
        }))}
        recordedAt={recordedAt}
        resolvesOn={resolvesOn(view.resolvesAt)}
        others={siblings.map((s) => ({ corpName: s.corpName, billAmount: s.billed }))}
        previews={previews}
        typeNames={typeNames}
        busy={pending}
        error={error}
        onTakeOver={takeOver}
        onResolve={resolveConflict}
        tell={
          onBookChanged && (
            <CorpDisputeAction
              view={view}
              payeeName={conflictPayeeName}
              onSent={onBookChanged}
              {...(mail ? { mail } : {})}
              {...(onResolve ? { onResolve: resolveConflict } : {})}
            />
          )
        }
      />
    );
  }
  const declare =
    onResolve &&
    view.noticeId !== undefined &&
    (view.state === 'billed' || view.declaration !== undefined) ? (
      <CorpDeclareSlot view={view} onResolve={onResolve} />
    ) : undefined;
  if (!overlap || acked === null || (!declare && acked.has(key))) return null;

  return (
    <OverlapNotice
      corpName={corpName}
      payeeNames={overlap.payeeIds.map(nameOf)}
      paid={overlap.paid}
      previews={previews}
      typeNames={typeNames}
      busy={pending}
      error={error}
      onTakeOver={takeOver}
      onPaidAnotherWay={() =>
        void acknowledgeOverlap(key).then(() => setAcked((held) => new Set(held).add(key)))
      }
      {...(declare ? { paidAnotherWay: declare } : {})}
    />
  );
}
