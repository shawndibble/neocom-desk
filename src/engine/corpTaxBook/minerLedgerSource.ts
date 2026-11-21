/**
 * A Corp Tax Book Miner's account as the one Payee ledger reads it (decision 20261120-235011,
 * "A Payee ledger"): the officer's Miner page and a pilot's own ledger list the same rows from
 * the same Running account. Pure: names come from the caller.
 */
import { adjustmentLineKey } from '../../../functions/src/corpTaxBookLateNotice';
import type {
  LedgerCharge,
  LedgerPayment,
  LedgerWriteOff,
  PayeeLedgerSource,
} from '../miningTax/payeeLedger';
import type { Adjustment } from './adjustments';
import type { BillableLine } from './billableLines';
import type { MinerAccountBooks } from './bookView';
import type { RecordedWriteOff } from './payments';
import { utcDayOf } from '../localDay';

export interface MinerLedgerNames {
  /** A Character's name; absent when unknown. */
  character: (characterId: number) => string | undefined;
  /** Where a mined line was: its moon, else its refinery; absent when unknown. */
  place?: (line: BillableLine) => string | undefined;
  /** Where a payment sits in the corp wallet, by its id; absent for one recorded by hand. */
  walletHref?: (paymentId: string) => string | undefined;
}

/** What the book records beside a Miner's account; both lists hold every Miner's. */
export interface MinerLedgerBook {
  adjustments?: readonly Adjustment[];
  writeOffs?: readonly RecordedWriteOff[];
}

export function minerLedgerSource(
  miner: MinerAccountBooks,
  book: MinerLedgerBook,
  names: MinerLedgerNames
): PayeeLedgerSource {
  const { minerId, account } = miner;
  const cp = account.input.checkpoint;
  const billed = new Set(miner.lines.map((l) => l.key));

  const mined = miner.lines
    .filter((l) => l.kind !== 'correction')
    .map((l): LedgerCharge => {
      const place = names.place?.(l);
      return {
        id: l.key,
        date: l.date,
        kind: 'mined',
        tax: l.tax,
        ...(place ? { place } : {}),
        ore: l.oreLines,
      };
    });
  // The account bills the corrections in `lines`; one an officer undid stays, struck through.
  const corrections = (book.adjustments ?? [])
    .filter(
      (a) =>
        a.minerId === minerId &&
        a.amount !== 0 &&
        (a.reversed || billed.has(adjustmentLineKey(a.id)))
    )
    .map((a): LedgerCharge => ({
      id: a.id,
      date: a.date,
      kind: 'correction',
      tax: a.amount,
      reason: a.reason,
      ...(a.kind === 'opening' ? { opening: true } : {}),
      ...(a.reversed ? { reversed: { at: a.reversed.at, reason: a.reversed.reason } } : {}),
    }));
  const payments = miner.payments.map((p): LedgerPayment => {
    const from = names.character(p.characterId);
    const href = names.walletHref?.(p.id);
    return {
      id: p.id,
      at: p.at,
      ...(from ? { from } : {}),
      ...(p.note ? { note: p.note } : {}),
      ...(href ? { href } : {}),
    };
  });
  // A write-off on or before the checkpoint is in its balance already: it forgives no later day.
  const writeOffs = (book.writeOffs ?? [])
    .filter((w) => w.minerId === minerId && (!cp || utcDayOf(w.at) > cp.through))
    .map((w): LedgerWriteOff => ({
      id: w.id,
      at: w.at,
      amount: w.amount,
      ...(w.reason ? { reason: w.reason } : {}),
      ...(w.reversed ? { reversed: { at: w.reversed.at, reason: w.reversed.reason } } : {}),
    }));
  return {
    account,
    ...(cp ? { opening: { through: cp.through, balance: cp.balance } } : {}),
    charges: [...mined, ...corrections],
    payments,
    writeOffs,
    notices: miner.notices,
    ...(miner.notYetBilled ? { notYetBilled: miner.notYetBilled } : {}),
  };
}
