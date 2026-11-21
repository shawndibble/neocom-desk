import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import {
  combineOverlaps,
  previewTakeover,
  type BookOverlap,
  type BookRowView,
} from '@/engine/corpTaxBook/personal';
import { releaseOre } from '../ledgerActions';
import { useLedgerAction } from '../useLedgerAction';
import { ConflictNotice } from './ConflictNotice';
import { CorpDeclareSlot } from './CorpDeclareAction';
import { CorpDisputeAction } from './CorpDisputeAction';
import type { MailContext } from './resolve/resolveSubmit';
import { conflictTarget, type ResolveTarget } from './resolve/targets';
import { resolvesOn } from './useCorpStateText';
import { OverlapNotice } from './OverlapNotice';
import { acknowledgeOverlap, overlapAckKey, readOverlapAcks } from './overlapAck';

/** Shared, so the memos below don't see a new empty array on every render. */
const NO_SIBLINGS: readonly BookRowView[] = [];

interface Props {
  view: BookRowView;
  corpName: string;
  /** Where the book recorded the ore, for a Conflict: the refinery, else the system. */
  recordedAt: string;
  /**
   * Other books' Conflict lines on the same day and system. A Conflict's fix then covers
   * them all: one take-over removes what each corporation recorded, which is the split.
   */
  siblings?: readonly BookRowView[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  typeNames: ReadonlyMap<number, string>;
  /** A change landed: reload the ledger. */
  onChanged: () => void;
  /**
   * A message reached the corporation (#6206): reload the books. With it, "I paid it another way"
   * on a day billed on a Statement goes to the corporation instead of staying a device-only note,
   * and a Conflict offers "Tell {corp}".
   */
  onBookChanged?: () => void;
  /** Opens the Resolve dialog (resolving in the app) on a problem of this day or its Statement. */
  onResolve?: (target: ResolveTarget) => void;
  /** Who is asking and who answers the book's tax questions: a Conflict's "Tell" mails them too. */
  mail?: MailContext;
}

/**
 * Finds the miner's own Assignments behind a book row's overlap and wires the
 * notice's two buttons (issue #4517). Renders nothing without an overlap, or
 * after the miner said they paid it another way.
 *
 * A Conflict day gets `ConflictNotice` instead, whatever was acknowledged: saying
 * "I paid it another way" changes nothing the book bills, so the conflict stays,
 * and hiding its explanation left a pill with no way to find the clashing entry.
 */
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
  const overlap = useMemo(
    () =>
      conflict ? combineOverlaps([view.overlap, ...siblings.map((s) => s.overlap)]) : view.overlap,
    [conflict, view.overlap, siblings]
  );
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
  // Each book's line takes only from the Payees it names, one after another, so a day several
  // corporations contest comes off the right Payee for each, not greedily off whichever is first.
  const parts = useMemo(
    () =>
      (conflict ? [view.overlap, ...siblings.map((s) => s.overlap)] : [view.overlap]).filter(
        (o): o is BookOverlap => o !== undefined
      ),
    [conflict, view.overlap, siblings]
  );
  const plan = useMemo(() => {
    const current = mine.map((a) => ({
      payeeId: a.payeeId ?? '',
      taxPct: a.taxPct,
      oreLines: a.oreLines,
      status: a.status,
    }));
    const before = current.map((c) => c.oreLines);
    for (const part of parts) {
      const at = current.flatMap((c, i) => (part.payeeIds.includes(c.payeeId) ? [i] : []));
      for (const step of previewTakeover(
        at.map((i) => current[i]!),
        part.ore
      )) {
        const i = at[step.index]!;
        current[i] = { ...current[i]!, oreLines: step.after };
      }
    }
    return current.flatMap((c, index) =>
      c.oreLines === before[index]
        ? []
        : [{ index, payeeId: c.payeeId, before: before[index]!, after: c.oreLines }]
    );
  }, [parts, mine]);

  const nameOf = (payeeId: string) => payeeById.get(payeeId)?.name ?? payeeId;
  const previews = plan.map((p) => ({
    payeeName: nameOf(p.payeeId),
    before: p.before,
    after: p.after,
  }));
  const takeOver = () =>
    void run(
      () => releaseOre(plan.map((p) => ({ assignment: mine[p.index], after: p.after }))),
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
    // Only while the day a Late notice asked for is still owed: a paid one has nothing to declare.
    onResolve &&
    view.noticeId !== undefined &&
    (view.state === 'billed' || view.declaration !== undefined) ? (
      <CorpDeclareSlot view={view} onResolve={onResolve} />
    ) : undefined;
  // A declaration goes to the corporation, so the device's own note no longer hides the notice.
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
