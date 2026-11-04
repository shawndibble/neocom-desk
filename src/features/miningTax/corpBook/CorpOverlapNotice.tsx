import { useEffect, useMemo, useState } from 'react';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { previewTakeover, type BookRowView } from '@/engine/corpTaxBook/personal';
import { releaseOre, unsettle } from '../ledgerActions';
import { useLedgerAction } from '../useLedgerAction';
import { ConflictNotice } from './ConflictNotice';
import { OverlapNotice } from './OverlapNotice';
import { acknowledgeOverlap, overlapAckKey, readOverlapAcks } from './overlapAck';
import { resolvesOn } from './useCorpStateText';

interface Props {
  view: BookRowView;
  corpName: string;
  /** Where the book recorded the ore, for a Conflict: the refinery, else the system. */
  recordedAt: string;
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  typeNames: ReadonlyMap<number, string>;
  /** A change landed: reload the ledger. */
  onChanged: () => void;
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
  everyAssignment,
  payeeById,
  typeNames,
  onChanged,
}: Props) {
  const { overlap } = view;
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
  const plan = useMemo(
    () =>
      overlap
        ? previewTakeover(
            mine.map((a) => ({
              payeeId: a.payeeId ?? '',
              taxPct: a.taxPct,
              oreLines: a.oreLines,
              status: a.status,
            })),
            overlap.ore
          )
        : [],
    [overlap, mine]
  );

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

  if (view.state === 'conflict') {
    return (
      <ConflictNotice
        corpName={corpName}
        cause={view.conflictCause}
        entries={mine.map((a) => ({
          id: a.id,
          payeeName: nameOf(a.payeeId ?? ''),
          taxOwed: a.taxOwed,
          paid: a.status === 'paid',
        }))}
        recordedAt={recordedAt}
        resolvesOn={resolvesOn(view.resolvesAt)}
        previews={previews}
        typeNames={typeNames}
        busy={pending}
        error={error}
        onUnmarkPaid={() =>
          void run(() => unsettle(mine.filter((a) => a.status === 'paid')), onChanged)
        }
        onTakeOver={takeOver}
      />
    );
  }
  if (!overlap || acked === null || acked.has(key)) return null;

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
    />
  );
}
