/**
 * A Corp Tax Book's money (D5/D15, D18, #4637): Tax Payments and officer write-offs, and which
 * money the book counts. Money never names a day: it pays the Miner's oldest unpaid day first
 * (`MinerRunningAccount`), whatever code it carries. Whose Miner a donation is, is the shared
 * rule (`functions/src/corpTaxBookDonationMatch.ts`, through `donationMatchBook` in `sync.ts`).
 */
import { netPayment } from '../../../functions/src/corpTaxBookRunningAccounts';

/** One Tax Payment credited to a Miner. */
export interface TaxPayment {
  id: string;
  minerId: string;
  /** The character that sent it. */
  characterId: number;
  amount: number;
  at: string;
  /** A `player_donation` found in the wallet journal, or one an officer recorded by hand. */
  source: 'donation' | 'manual';
  /** How much of it an officer marked "not tax". */
  notTaxAmount?: number;
  /**
   * Why a donation waits Unmatched for an officer. `ambiguous`: the shared rule found it could be
   * any of several Miners (`ambiguousMinerIds`). `no-open-balance` is legacy (#6207, reversed by
   * #6300): no longer set, and the next sync assigns any still stored. `account-closed`: the
   * sender's Miner account is closed, so an officer decides where it goes (the exact string is the
   * server's; reconcile at merge).
   */
  reviewReason?: 'no-open-balance' | 'ambiguous' | 'account-closed';
  /** `ambiguous`: the Miners the donation could be, for the officer to pick from. */
  ambiguousMinerIds?: string[];
  /** A hand record of a transfer the book also noted in a division it does not read: that donation's id. */
  transferId?: string;
  /** When an officer last placed it on a Miner, or took it off one (`reassignPayment`). */
  assignedAt?: string;
  /** An officer's note on a payment recorded by hand; the Miner reads it too. */
  note?: string;
}

/** A `writeOffs` doc as the book stores it: the corporation forgave part of what a Miner owes. */
export interface RecordedWriteOff {
  id: string;
  minerId: string;
  amount: number;
  /** ISO instant it was recorded. */
  at: string;
  reason: string;
  /** An officer undid it: the record stays, struck through, and no longer counts. */
  reversed?: { by: number; at: string; reason: string };
}

/** Whether a donation's UTC timestamp falls before the book's start date (a donation on the start date counts). */
export function isBeforeBook(at: string, startDate: string): boolean {
  return at.slice(0, 10) < startDate;
}

/** What of a Tax Payment is tax: its amount less the part coded "not tax" (the shared rule). */
export { netPayment };

/** The Tax Payments the book counts, in the order they are applied: a donation before `startDate` drops out; oldest first. */
export function countedPayments(payments: readonly TaxPayment[], startDate?: string): TaxPayment[] {
  return payments
    .filter((p) => !startDate || p.source !== 'donation' || !isBeforeBook(p.at, startDate))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
