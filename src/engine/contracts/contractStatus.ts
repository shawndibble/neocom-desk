import type { Contract } from '@/esi/endpoints';

const ACTIVE_STATUSES = new Set<Contract['status']>(['outstanding', 'in_progress']);

export function isFinishedContractStatus(status: string): boolean {
  return status === 'finished' || status === 'finished_issuer' || status === 'finished_contractor';
}

export function isActiveContractStatus(status: Contract['status']): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function withAcceptedCourierInProgress<
  T extends Pick<Contract, 'type' | 'status' | 'acceptor_id' | 'date_accepted'>,
>(contract: T): T {
  if (
    contract.type === 'courier' &&
    contract.status === 'outstanding' &&
    contract.acceptor_id !== 0 &&
    contract.acceptor_id !== undefined &&
    contract.date_accepted !== undefined
  ) {
    return { ...contract, status: 'in_progress' };
  }
  return contract;
}

export type ContractStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export function contractStatusTone(status: Contract['status']): ContractStatusTone {
  switch (status) {
    case 'finished':
    case 'finished_issuer':
    case 'finished_contractor':
      return 'success';
    case 'outstanding':
    case 'in_progress':
      return 'warning';
    case 'failed':
    case 'rejected':
    case 'reversed':
      return 'danger';
    case 'cancelled':
    case 'deleted':
      return 'neutral';
  }
}
