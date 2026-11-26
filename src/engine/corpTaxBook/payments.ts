import { netPayment } from '../../../functions/src/corpTaxBookRunningAccounts';

export interface TaxPayment {
  id: string;
  minerId: string;
  characterId: number;
  amount: number;
  at: string;
  source: 'donation' | 'manual';
  notTaxAmount?: number;
  reviewReason?: 'no-open-balance' | 'ambiguous' | 'account-closed';
  ambiguousMinerIds?: string[];
  transferId?: string;
  assignedAt?: string;
  note?: string;
}

export interface RecordedWriteOff {
  id: string;
  minerId: string;
  amount: number;
  at: string;
  reason: string;
  reversed?: { by: number; at: string; reason: string };
}

export function isBeforeBook(at: string, startDate: string): boolean {
  return at.slice(0, 10) < startDate;
}

export { netPayment };

export function countedPayments(payments: readonly TaxPayment[], startDate?: string): TaxPayment[] {
  return payments
    .filter((p) => !startDate || p.source !== 'donation' || !isBeforeBook(p.at, startDate))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
