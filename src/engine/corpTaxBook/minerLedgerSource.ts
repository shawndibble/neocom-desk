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
import type { BookRowView } from './personal';
import { addLines } from '../miningTax/oreLines';
import { utcDayOf } from '../localDay';

export interface MinerLedgerNames {
  character: (characterId: number) => string | undefined;
  place?: (line: BillableLine) => string | undefined;
  walletHref?: (paymentId: string) => string | undefined;
}

export interface MinerLedgerBook {
  adjustments?: readonly Adjustment[];
  writeOffs?: readonly RecordedWriteOff[];
}

export function openDayCharges(
  rows: readonly BookRowView[],
  corporationId: number,
  minerId: string,
  systemName: (solarSystemId: number) => string | undefined
): LedgerCharge[] {
  const byId = new Map<string, LedgerCharge>();
  for (const view of rows) {
    if (!view.open || view.corporationId !== corporationId || view.minerId !== minerId) continue;
    const id = view.id.replace(/:paid$/, '');
    const held = byId.get(id);
    if (held) {
      byId.set(id, {
        ...held,
        tax: held.tax + view.billed,
        ore: addLines(held.ore ?? [], view.oreLines),
      });
      continue;
    }
    const place = view.refineryLabel ?? systemName(view.solarSystemId);
    byId.set(id, {
      id,
      date: view.date,
      kind: 'mined',
      tax: view.billed,
      ...(place ? { place } : {}),
      ore: view.oreLines,
      open: true,
    });
  }
  return [...byId.values()];
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
      source: p.source,
      ...(p.notTaxAmount ? { notTax: p.notTaxAmount } : {}),
    };
  });
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
