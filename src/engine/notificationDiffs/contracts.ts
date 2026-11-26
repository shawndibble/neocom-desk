export type ContractStatus =
  | 'outstanding'
  | 'in_progress'
  | 'finished_issuer'
  | 'finished_contractor'
  | 'finished'
  | 'cancelled'
  | 'rejected'
  | 'failed'
  | 'deleted'
  | 'reversed';

export interface ContractEntrySnapshot {
  contractId: number;
  status: ContractStatus;
  issuerId: number;
  acceptorId: number;
  deliveryDeadlineMs?: number;
  dueLeadMs?: number;
  expiresMs?: number;
  expiringLeadMs?: number;
  dateAcceptedMs?: number;
  dateCompletedMs?: number;
}

export interface ContractSnapshot {
  entries: readonly ContractEntrySnapshot[];
  nowMs: number;
}

export interface ContractNotificationFire {
  eventId:
    | 'contractAccepted'
    | 'contractCompleted'
    | 'contractFailed'
    | 'courierDeliveryDue'
    | 'contractExpiring';
  characterId: number;
  contractId: number;
  deadlineMs?: number;
  thresholdMs?: number;
  occurredMs?: number;
  walletChangeIsk?: number;
}

export function diffContractAccepted(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.status !== 'in_progress') continue;
    const before = prevById.get(entry.contractId);
    if (before?.status === 'in_progress') continue;
    if (before?.status === 'outstanding' && before.acceptorId !== 0) continue;
    fires.push({
      eventId: 'contractAccepted',
      characterId,
      contractId: entry.contractId,
      ...(entry.dateAcceptedMs === undefined ? {} : { occurredMs: entry.dateAcceptedMs }),
    });
  }
  return fires;
}

export function diffCourierDeliveryDue(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    const { deliveryDeadlineMs, dueLeadMs } = entry;
    if (entry.status !== 'in_progress' || entry.acceptorId !== characterId) continue;
    if (deliveryDeadlineMs === undefined || dueLeadMs === undefined) continue;
    const remainingNow = deliveryDeadlineMs - next.nowMs;
    if (remainingNow <= 0 || remainingNow > dueLeadMs) continue;
    const before = prevById.get(entry.contractId);
    if (
      before !== undefined &&
      before.status === 'in_progress' &&
      before.deliveryDeadlineMs === deliveryDeadlineMs &&
      before.dueLeadMs !== undefined &&
      deliveryDeadlineMs - prev.nowMs <= before.dueLeadMs
    ) {
      continue;
    }
    fires.push({
      eventId: 'courierDeliveryDue',
      characterId,
      contractId: entry.contractId,
      deadlineMs: deliveryDeadlineMs,
      thresholdMs: dueLeadMs,
    });
  }
  return fires;
}

export function diffContractExpiring(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    const { expiresMs, expiringLeadMs } = entry;
    if (entry.status !== 'outstanding' || entry.issuerId !== characterId) continue;
    if (expiresMs === undefined || expiringLeadMs === undefined) continue;
    const remainingNow = expiresMs - next.nowMs;
    if (remainingNow <= 0 || remainingNow > expiringLeadMs) continue;
    const before = prevById.get(entry.contractId);
    if (
      before !== undefined &&
      before.status === 'outstanding' &&
      before.expiresMs === expiresMs &&
      before.expiringLeadMs !== undefined &&
      expiresMs - prev.nowMs <= before.expiringLeadMs
    ) {
      continue;
    }
    fires.push({
      eventId: 'contractExpiring',
      characterId,
      contractId: entry.contractId,
      deadlineMs: expiresMs,
      thresholdMs: expiringLeadMs,
    });
  }
  return fires;
}

const COMPLETED_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set([
  'finished_issuer',
  'finished_contractor',
  'finished',
]);

function wasLiveContractStatus(prevStatus: ContractStatus | undefined): boolean {
  return prevStatus === 'outstanding' || prevStatus === 'in_progress';
}

function isPartyToContract(entry: ContractEntrySnapshot, characterId: number): boolean {
  return entry.issuerId === characterId || entry.acceptorId === characterId;
}

function diffContractTerminalTransition(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot,
  eventId: 'contractCompleted' | 'contractFailed',
  matchesStatus: (status: ContractStatus) => boolean,
  occurredAt: (entry: ContractEntrySnapshot) => number | undefined = () => undefined
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevStatusById = new Map(prev.entries.map((entry) => [entry.contractId, entry.status]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    if (!matchesStatus(entry.status)) continue;
    if (!wasLiveContractStatus(prevStatusById.get(entry.contractId))) continue;
    if (!isPartyToContract(entry, characterId)) continue;
    const occurredMs = occurredAt(entry);
    fires.push({
      eventId,
      characterId,
      contractId: entry.contractId,
      ...(occurredMs === undefined ? {} : { occurredMs }),
    });
  }
  return fires;
}

export function diffContractCompleted(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  return diffContractTerminalTransition(
    characterId,
    prev,
    next,
    'contractCompleted',
    (status) => COMPLETED_CONTRACT_STATUSES.has(status),
    (entry) => entry.dateCompletedMs
  );
}

export function diffContractFailed(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  return diffContractTerminalTransition(
    characterId,
    prev,
    next,
    'contractFailed',
    (status) => status === 'failed'
  );
}
