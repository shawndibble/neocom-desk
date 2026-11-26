import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { combineOverlaps, type BookRowView } from '@/engine/corpTaxBook/personal';
import { ConflictNotice } from './ConflictNotice';
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
  onBookChanged,
  onResolve,
  mail,
}: Props) {
  const { t } = useTranslation();
  const conflict = view.state === 'conflict';
  const [acked, setAcked] = useState<Set<string> | null>(null);
  const key = overlapAckKey(view.corporationId, view.characterId, view.date, view.solarSystemId);

  useEffect(() => {
    let cancelled = false;
    void readOverlapAcks().then((held) => !cancelled && setAcked(held));
    return () => {
      cancelled = true;
    };
  }, []);

  const overlap = useMemo(
    () =>
      conflict ? combineOverlaps([view.overlap, ...siblings.map((s) => s.overlap)]) : view.overlap,
    [conflict, view.overlap, siblings]
  );
  const mine = useMemo(
    () =>
      overlap
        ? everyAssignment.filter(
            (a) =>
              a.characterId === view.characterId &&
              a.date === view.date &&
              a.solarSystemId === view.solarSystemId &&
              a.status !== 'dismissed' &&
              a.payeeId !== undefined &&
              overlap.payeeIds.includes(a.payeeId)
          )
        : [],
    [overlap, everyAssignment, view.characterId, view.date, view.solarSystemId]
  );

  const nameOf = (payeeId: string) => payeeById.get(payeeId)?.name ?? payeeId;

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
        entries={mine.map((a) => ({
          id: a.id,
          payeeName: nameOf(a.payeeId ?? ''),
          taxOwed: a.taxOwed,
          paid: a.status === 'paid',
        }))}
        recordedAt={recordedAt}
        resolvesOn={resolvesOn(view.resolvesAt)}
        others={siblings.map((s) => ({ corpName: s.corpName, billAmount: s.billed }))}
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
      onPaidAnotherWay={() =>
        void acknowledgeOverlap(key).then(() => setAcked((held) => new Set(held).add(key)))
      }
      {...(declare ? { paidAnotherWay: declare } : {})}
    />
  );
}
