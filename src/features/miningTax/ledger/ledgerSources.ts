/**
 * What a Payee ledger is built from (`PayeeLedgerSource`), for either kind of Payee: a personal
 * Payee's Running account (`PayeeRunningAccount`), or a Corp Tax Book's Miner's (`BookMinerRunningAccount`, the
 * book's own account with the member's donations in flight). The money is the account's; these
 * only say what each charge, payment, write-off and notice was.
 */
import type { BookMinerRunningAccount } from '@/engine/corpTaxBook/personal';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/payments';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import type { PayeeLedgerSource } from '@/engine/miningTax/payeeLedger';
import type { MiningTaxAssignmentRecord } from '@/db';
import { madePaymentHref } from '../madePaymentHref';

/** A personal Payee's ledger: each charge an Assignment, each payment a link to its transaction. */
export function personalLedgerSource(
  account: PayeeRunningAccount,
  assignmentOf: (id: string) => MiningTaxAssignmentRecord | undefined,
  placeOf: (a: MiningTaxAssignmentRecord) => string | undefined,
  payerOf: (payment: { kind: string; refId: number | string }) => string | undefined
): PayeeLedgerSource {
  return account.ledgerSource({
    charge: (c) => {
      const a = assignmentOf(c.id);
      const place = a ? placeOf(a) : undefined;
      return {
        kind: 'mined',
        ...(place ? { place } : {}),
        ...(a ? { ore: a.oreLines } : {}),
      };
    },
    payment: (l) => {
      const from = payerOf(l);
      const href = madePaymentHref(l);
      return {
        at: `${l.paidOn}T00:00:00.000Z`,
        ...(from ? { from } : {}),
        ...(href ? { href } : {}),
      };
    },
  });
}

/** A Corp Tax Book Miner's ledger, with the book's write-offs and Late notices. */
export function bookLedgerSource(
  miner: BookMinerRunningAccount,
  writeOffs: readonly RecordedWriteOff[],
  placeOf: (structureId: number | undefined) => string | undefined,
  nameOf: (characterId: number) => string | undefined
): PayeeLedgerSource {
  const cp = miner.account.input.checkpoint;
  return {
    account: miner.account,
    charges: miner.lines.map((l) => {
      const place = l.kind === 'correction' ? undefined : placeOf(l.structureId);
      return {
        id: l.key,
        date: l.date,
        kind: l.kind === 'correction' ? ('correction' as const) : ('mined' as const),
        tax: l.tax,
        ...(place ? { place } : {}),
        ...(l.oreLines.length > 0 ? { ore: l.oreLines } : {}),
        ...(l.reason ? { reason: l.reason } : {}),
      };
    }),
    payments: miner.payments.map((p) => {
      const from = nameOf(p.characterId);
      return {
        id: p.id,
        at: p.at,
        ...(from ? { from } : {}),
        ...(p.note ? { note: p.note } : {}),
      };
    }),
    writeOffs: writeOffs
      .filter((w) => w.minerId === miner.minerId && !w.reversed)
      .map((w) => ({ id: w.id, at: w.at, amount: w.amount, reason: w.reason })),
    notices: miner.notices,
    ...(cp ? { opening: { through: cp.through, balance: cp.balance } } : {}),
  };
}
