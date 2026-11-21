import { characterIdsOfMiner, type DayCharge } from '../charges';
import { minerBillableLines } from '../billableLines';
import { disputeHold, disputesToShow, isMinersDispute } from '../disputes';
import { heldBillableThrough, type StaleHold } from '../feederHealth';
import { MinerRunningAccount } from '../minerRunningAccount';
import { checkpointFits } from '../../../../functions/src/corpTaxBookCheckpoint';
import { isBeforeBook, type TaxPayment } from '../payments';
import { exemptionsOf } from '../toleranceExemptions';
import type { MinerSettlement, OpenSetInput } from './types';

/** The Miner ids a book lists, in order: groupings, then the ids days, notices and payments name. */
export function minerIdsOf(input: OpenSetInput, charges: readonly DayCharge[]): string[] {
  const ids = new Set<string>(input.miners.map((m) => m.id));
  for (const c of charges) ids.add(c.minerId);
  for (const n of input.notices) ids.add(n.minerId);
  for (const p of input.payments) if (p.minerId) ids.add(p.minerId);
  return [...ids];
}

/**
 * One Miner's Running account (#6294): its Billable lines through its own billable-through, its
 * payments and write-offs, the days an open dispute holds, from its closed-through checkpoint.
 */
export function settleMiner(
  input: OpenSetInput,
  minerId: string,
  charges: readonly DayCharge[],
  book: { billableThrough: string | undefined; holds: ReadonlyMap<number, StaleHold> }
): MinerSettlement {
  const notices = input.notices
    .filter((n) => n.minerId === minerId)
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id));
  const payments = input.payments.filter(
    (p): p is TaxPayment =>
      p.minerId === minerId && (p.source !== 'donation' || !isBeforeBook(p.at, input.startDate))
  );
  const characterIds = characterIdsOfMiner(minerId, input.miners);
  const hold = characterIds
    .map((cid) => book.holds.get(cid))
    .filter((h) => h !== undefined)
    .sort((a, b) => a.from.localeCompare(b.from))[0];
  const billableThrough = heldBillableThrough(book.billableThrough, characterIds, book.holds);
  const billable = minerBillableLines({
    minerId,
    startDate: input.startDate,
    charges,
    adjustments: input.adjustments ?? [],
    dismissals: input.dismissals,
    billableThrough,
  });
  // An open dispute nobody has dismissed yet holds its date (`disputesToShow`).
  const heldDays = new Set(
    disputesToShow(input.disputes ?? [], input.dismissals)
      .filter((d) => isMinersDispute(d, minerId, characterIds) && disputeHold(d, input.now))
      .map((d) => d.date)
  );
  // One summed for other characters than the Miner has now is no history of this account (B3).
  const stored = input.checkpoints?.get(minerId);
  const checkpoint = stored && checkpointFits(stored, characterIds) ? stored : undefined;
  const storedPaidThrough = input.minerPaidThrough?.get(minerId);
  const account = MinerRunningAccount.build({
    days: billable.lines,
    payments,
    writeOffs: (input.writeOffs ?? []).filter((w) => w.minerId === minerId && !w.reversed),
    startDate: input.startDate,
    heldDays,
    ...(storedPaidThrough !== undefined ? { storedPaidThrough } : {}),
    ...(input.dayTolerancePct !== undefined ? { dayTolerancePct: input.dayTolerancePct } : {}),
    toleranceExemptions: exemptionsOf(input.toleranceExemptions, minerId),
    ...(checkpoint ? { checkpoint } : {}),
  });
  return {
    characterIds,
    notices,
    payments,
    billableThrough,
    ...(hold ? { hold } : {}),
    billable,
    heldDays,
    account,
  };
}
