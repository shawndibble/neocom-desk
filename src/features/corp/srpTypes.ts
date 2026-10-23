// Client mirror of `functions/src/srpTypes.ts` (issue #4848, epic #4608, ADR 0026): the shapes
// the SRP callables take and return. Kept as its own copy, not an import, because the Cloud
// Functions package is built separately; the two are kept in step by hand.
//
// Data lives under `corps/{corporationId}` and is written only through callables:
//   srp/settings, srpClaims/{killmailId}, srpAudit/{id}, srpOfficers/{uid}.

/** A claim's window, in days from the loss: corp default and the range a Director may set. */
export const DEFAULT_CLAIM_WINDOW_DAYS = 30;
export const MAX_CLAIM_WINDOW_DAYS = 365;
export const MAX_HULL_RULES = 500;

/** What a Hull Rule does for its hull or class (GLOSSARY.md "Hull Rule"). */
export type HullRuleKind = 'pay-fixed' | 'pay-percent' | 'not-covered' | 'officer-decides';
export const HULL_RULE_KINDS: readonly HullRuleKind[] = [
  'pay-fixed',
  'pay-percent',
  'not-covered',
  'officer-decides',
];

/** `hull` keys on an SDE type id, `class` on a ship group id. A hull rule wins over its class's. */
export type HullRuleScope = 'hull' | 'class';

export type HullRule =
  | { scope: HullRuleScope; id: number; kind: 'pay-fixed'; iskAmount: number }
  | { scope: HullRuleScope; id: number; kind: 'pay-percent'; pct: number }
  | { scope: HullRuleScope; id: number; kind: 'not-covered' | 'officer-decides' };

/** `corps/{corporationId}/srp/settings`. */
export interface SrpSettings {
  corporationId: number;
  /** Off hides SRP from members and refuses new claims; claims and rules are kept. */
  enabled: boolean;
  /** The corp's percent of the killmail value, 0-100; null when the corp prices no claim that way. */
  killmailPct: number | null;
  /** The corp's percent of the Jita Appraisal, 0-100; null when unset. */
  appraisalPct: number | null;
  hullRules: HullRule[];
  windowDays: number;
  /** A claim must say which Fleet or FC the loss was under. */
  requireFleetOrFc: boolean;
  /** Who turned SRP on, and who owns it now (a CEO reclaim moves it). */
  createdBy: number;
  createdAt: number;
  ownerCharacterId: number;
  updatedAt: number;
  updatedBy: number;
}

/** The patch `saveSrpSettingsCallable` takes; every field optional, at least one present. */
export interface SrpSettingsPatch {
  killmailPct?: number | null;
  appraisalPct?: number | null;
  hullRules?: HullRule[];
  windowDays?: number;
  requireFleetOrFc?: boolean;
}

/**
 * The fields of an SRP Claim doc that rules and the officer gate rely on. The
 * file-claim callable (#4850) writes the rest. `uid` and `ownerHash` are the filer's
 * verified identity, which is what lets a pilot read only their own claims.
 */
export interface SrpClaimKey {
  uid: string;
  /** The filer's ownerHash at filing; rules require it to match the reader's token. */
  ownerHash: string;
  corporationId: number;
  killmailId: number;
}

/** `verifySrpOfficerCallable`'s answer. */
export interface SrpOfficerVerdict {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  /** Director, Accountant or CEO: may approve, reject, override and mark paid. */
  canManage: boolean;
  srpEnabled: boolean;
  /** Epoch ms: rules show the officer the claim queue until then. */
  expiresAt: number;
}

/** `getSrpStatusCallable`'s answer: what any member needs to show the SRP page. */
export interface SrpStatus {
  corporationId: number;
  enabled: boolean;
  /** The rules a pilot sees when filing; absent while SRP is off. */
  settings?: Pick<
    SrpSettings,
    'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
  >;
}

/** A claim's `state`. `closedAt` (epoch ms) is set when it becomes paid or rejected. */
export type SrpClaimState = 'pending' | 'approved' | 'paid' | 'rejected';

/** `fileSrpClaimCallable`'s input beside the corporation and token. */
export interface FileSrpClaimInput {
  /** A pasted zKillboard (`/kill/<id>/`) or ESI (`/killmails/<id>/<hash>/`) link. */
  killmail: string;
  /** Which Fleet or FC the loss was under; required when the corp says so. */
  fleetOrFc?: string;
  /** Required when re-filing after a rejection. */
  note?: string;
}

/** How a claim's amount was reached (mirror of the pricing engine's basis). */
export type SrpClaimBasis =
  | { step: 'hull-fixed' }
  | { step: 'class-fixed' }
  | { step: 'killmail-percent'; percent: number }
  | { step: 'appraisal-percent'; percent: number };

/** `fileSrpClaimCallable`'s answer. */
export interface FiledSrpClaim {
  killmailId: number;
  state: 'pending';
  /** Whole ISK; null when an officer types the amount. */
  amount: number | null;
  basis: SrpClaimBasis | null;
}
