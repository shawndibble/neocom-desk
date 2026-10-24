/** Every `action` the SRP audit log writes (mirrors `functions/src/srp*.ts`); a feed line is worded per action. */
export const SRP_AUDIT_ACTIONS = [
  'fileClaim',
  'refileClaim',
  'approveClaim',
  'rejectClaim',
  'changeClaimAmount',
  'markClaimPaid',
  'turnOn',
  'turnOff',
  'saveSettings',
  'reclaim',
  'addDoctrine',
  'updateDoctrine',
  'deleteDoctrine',
  'retentionDelete',
] as const;

export type SrpAuditAction = (typeof SRP_AUDIT_ACTIONS)[number];

export const isSrpAuditAction = (action: string): action is SrpAuditAction =>
  (SRP_AUDIT_ACTIONS as readonly string[]).includes(action);
