import type { DoctrineCheckRecord, SrpClaimBasis, SrpClaimState } from './srpTypes';

export interface SrpClaim {
  killmailId: number;
  killmailHash?: string;
  corporationId: number;
  characterId: number;
  characterName: string;
  hullTypeId: number;
  solarSystemId: number;
  killedAt: number;
  filedAt: number;
  state: SrpClaimState;
  amount: number | null;
  basis: SrpClaimBasis | null;
  suggested: { isk: number; basis: SrpClaimBasis } | null;
  fleetOrFc: string | null;
  note: string | null;
  refileCount: number;
  doctrineCheck?: DoctrineCheckRecord;
  previousRejectionReason?: string | null;
  computedAmount?: number | null;
  amountSource?: 'typed' | 'override';
  overrideReason?: string;
  overrideBy?: number;
  overrideByName?: string;
  overrideAt?: number;
  decidedAt?: number;
  decidedBy?: number;
  decidedByName?: string;
  rejectionReason?: string;
  paidAt?: number;
  paidBy?: number;
  paidByName?: string;
  closedAt?: number;
}

export interface SrpAuditEntry {
  id: string;
  at: number;
  by: number | null;
  byName: string;
  action: string;
  detail: Record<string, unknown>;
}

export interface SrpClaimOutcome {
  killmailId: number;
  state: SrpClaimState;
  characterId: number | null;
  characterName: string | null;
  amount: number | null;
  reason?: string;
}

export type SrpBatchResult =
  | ({ ok: true } & SrpClaimOutcome)
  | { ok: false; killmailId: number; reason: string; message: string };

export interface SrpBatchOutcome {
  results: SrpBatchResult[];
}

export interface SrpApproveItem {
  killmailId: number;
  amount?: number;
  reason?: string;
  expectedAmount?: number | null;
}

export interface SrpMarkPaidItem {
  killmailId: number;
  expectedAmount?: number | null;
}
