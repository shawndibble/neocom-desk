import { useEffect, useMemo, useState } from 'react';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { previewTakeover, type BookRowView } from '@/engine/corpTaxBook/personal';
import { releaseOre } from '../ledgerActions';
import { useLedgerAction } from '../useLedgerAction';
import { OverlapNotice } from './OverlapNotice';
import { acknowledgeOverlap, overlapAckKey, readOverlapAcks } from './overlapAck';

interface Props {
  view: BookRowView;
  corpName: string;
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
 */
export function CorpOverlapNotice({
  view,
  corpName,
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

  if (!overlap || acked === null || acked.has(key)) return null;
  const nameOf = (payeeId: string) => payeeById.get(payeeId)?.name ?? payeeId;

  return (
    <OverlapNotice
      corpName={corpName}
      payeeNames={overlap.payeeIds.map(nameOf)}
      paid={overlap.paid}
      previews={plan.map((p) => ({
        payeeName: nameOf(p.payeeId),
        before: p.before,
        after: p.after,
      }))}
      typeNames={typeNames}
      busy={pending}
      error={error}
      onTakeOver={() =>
        void run(
          () => releaseOre(plan.map((p) => ({ assignment: mine[p.index], after: p.after }))),
          onChanged
        )
      }
      onPaidAnotherWay={() =>
        void acknowledgeOverlap(key).then(() => setAcked((held) => new Set(held).add(key)))
      }
    />
  );
}
