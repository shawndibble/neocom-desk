/**
 * A Corp Tax Book Miner's account as the one Payee ledger reads it (decision 20261120-235011,
 * "A Payee ledger"): the officer's Miner page and a pilot's own ledger list the same rows from
 * the same Running account. Pure: names come from the caller.
 */
import type {
  LedgerCharge,
  LedgerPayment,
  LedgerWriteOff,
  PayeeLedgerSource,
} from '../miningTax/payeeLedger';
import { minerDetail, type BookView, type DayRow } from './bookView';
import { utcDayOf } from '../localDay';

export interface MinerLedgerNames {
  /** A Character's name. */
  character: (characterId: number) => string;
  /** Where a mined day was: its moon, else its refinery; absent when unknown. */
  place?: (day: DayRow) => string | undefined;
  /** Where a payment sits in the corp wallet, by its id; absent for one recorded by hand. */
  walletHref?: (paymentId: string) => string | undefined;
}

/** Undefined for a Miner the view does not hold. */
export function minerLedgerSource(
  view: BookView,
  minerId: string,
  names: MinerLedgerNames
): PayeeLedgerSource | undefined {
  const detail = minerDetail(view, minerId);
  const inner = view.internals.byMiner.get(minerId);
  if (!detail || !inner) return undefined;
  const through = detail.checkpoint?.through;
  const after = (date: string) => through === undefined || date > through;

  const mined = detail.days
    .filter((d) => d.status === 'paid' || d.status === 'owed')
    .map((d): LedgerCharge => {
      const place = names.place?.(d);
      return {
        id: d.key,
        date: d.date,
        kind: 'mined',
        tax: d.tax,
        ...(place ? { place } : {}),
        ore: d.oreLines,
      };
    });
  const corrections = view.input.adjustments
    .filter((a) => a.minerId === minerId && a.amount !== 0)
    .map((a): LedgerCharge => ({
      id: a.id,
      date: a.date,
      kind: 'correction',
      tax: a.amount,
      reason: a.reason,
      ...(a.kind === 'opening' ? { opening: true } : {}),
      ...(a.reversed ? { reversed: { at: a.reversed.at, reason: a.reversed.reason } } : {}),
    }));
  const payments = detail.payments.map((p): LedgerPayment => {
    const href = names.walletHref?.(p.id);
    return {
      id: p.id,
      at: p.at,
      from: names.character(p.characterId),
      ...(p.note ? { note: p.note } : {}),
      ...(href ? { href } : {}),
    };
  });
  // A write-off on or before the checkpoint is in its balance already.
  const writeOffs = (view.input.writeOffs ?? [])
    .filter((w) => w.minerId === minerId && after(utcDayOf(w.at)))
    .map((w): LedgerWriteOff => ({
      id: w.id,
      at: w.at,
      amount: w.amount,
      ...(w.reason ? { reason: w.reason } : {}),
      ...(w.reversed ? { reversed: { at: w.reversed.at, reason: w.reversed.reason } } : {}),
    }));
  const pending = detail.days.filter((d) => d.status === 'not-billable');
  return {
    account: inner.account,
    ...(detail.checkpoint
      ? { opening: { through: detail.checkpoint.through, balance: detail.checkpoint.balance } }
      : {}),
    charges: [...mined, ...corrections],
    payments,
    writeOffs,
    notices: detail.notices,
    notYetBilled: {
      tax: pending.reduce((sum, d) => sum + d.tax, 0),
      days: pending.length,
    },
  };
}
