import { characterIdsOfMiner, type DayCharge } from '../charges';
import { minerBillableLines, savedPrice } from '../billableLines';
import { disputeHold, disputesToShow, isMinersDispute } from '../disputes';
import { heldBillableThrough, type StaleHold } from '../feederHealth';
import { MinerRunningAccount } from '../minerRunningAccount';
import {
  checkpointFits,
  isSnapshot,
  type RunningAccountCheckpoint,
} from '../../../../functions/src/corpTaxBookCheckpoint';
import { isBeforeBook, type TaxPayment } from '../payments';
import { exemptionsOf } from '../toleranceExemptions';
import type { MinerSettlement, OpenSetInput } from './types';

export function usableCheckpoint(
  stored: RunningAccountCheckpoint | undefined,
  characterIds: readonly number[]
): RunningAccountCheckpoint | undefined {
  return stored &&
    typeof stored.at === 'string' &&
    isSnapshot(stored) &&
    checkpointFits(stored, characterIds)
    ? stored
    : undefined;
}

export function minerIdsOf(input: OpenSetInput, charges: readonly DayCharge[]): string[] {
  const ids = new Set<string>(input.miners.map((m) => m.id));
  for (const c of charges) ids.add(c.minerId);
  for (const n of input.notices) ids.add(n.minerId);
  for (const p of input.payments) if (p.minerId) ids.add(p.minerId);
  return [...ids];
}

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
  const heldDays = new Set(
    disputesToShow(input.disputes ?? [], input.dismissals)
      .filter((d) => isMinersDispute(d, minerId, characterIds) && disputeHold(d, input.now))
      .map((d) => d.date)
  );
  const disputeWaivers = new Map<string, number>();
  for (const d of input.disputes ?? [])
    if (d.resolution?.kind === 'dismissed' && isMinersDispute(d, minerId, characterIds))
      disputeWaivers.set(d.date, (disputeWaivers.get(d.date) ?? 0) + d.resolution.amountIsk);
  const checkpoint = usableCheckpoint(input.checkpoints?.get(minerId), characterIds);
  const storedPaidThrough = input.minerPaidThrough?.get(minerId);
  const account = MinerRunningAccount.build({
    days: billable.lines.map((l) => ({ ...l, savedPrice: savedPrice(l) })),
    payments,
    writeOffs: (input.writeOffs ?? []).filter((w) => w.minerId === minerId && !w.reversed),
    startDate: input.startDate,
    heldDays,
    disputeWaivers,
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
