// Client mirror of the SRP claim doc and the officer callables' shapes (ADR 0026). Mirrors `functions/src/srpOfficer.ts` and what `fileSrpClaim` writes; kept as its
// own copy because the Cloud Functions package is built separately.
import type { DoctrineCheckRecord, SrpClaimBasis, SrpClaimState } from './srpTypes';

/** `corps/{corporationId}/srpClaims/{killmailId}`: the fields the officer queue reads. */
export interface SrpClaim {
  killmailId: number;
  corporationId: number;
  /** The pilot the claim belongs to. */
  characterId: number;
  characterName: string;
  hullTypeId: number;
  solarSystemId: number;
  killedAt: number;
  filedAt: number;
  state: SrpClaimState;
  /** Whole ISK in force (the worked-out one, or an officer's); null when an officer must type it. */
  amount: number | null;
  basis: SrpClaimBasis | null;
  /** A figure to offer when the Hull Rule said the officer decides. */
  suggested: { isk: number; basis: SrpClaimBasis } | null;
  fleetOrFc: string | null;
  note: string | null;
  refileCount: number;
  /** The doctrine-fit result taken at filing; absent on claims filed before the check existed. */
  doctrineCheck?: DoctrineCheckRecord;
  previousRejectionReason?: string | null;
  /** The worked-out amount, kept when an officer changed it. */
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
  /** Epoch ms the claim became Paid or Rejected. */
  closedAt?: number;
}

/** One entry of `corps/{id}/srpAudit`. */
export interface SrpAuditEntry {
  id: string;
  at: number;
  /** Null for the retention sweep. */
  by: number | null;
  byName: string;
  action: string;
  detail: Record<string, unknown>;
}

/** What an officer action returns, and what the result mail needs. */
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
  /** An officer-typed amount, or one that differs from the worked-out one (then `reason` is needed). */
  amount?: number;
  reason?: string;
  /** The amount the officer saw; the server refuses with `amount-changed` when it differs now. */
  expectedAmount?: number | null;
}

/** One claim of a mark-paid call, with the amount the officer saw. */
export interface SrpMarkPaidItem {
  killmailId: number;
  expectedAmount?: number | null;
}
