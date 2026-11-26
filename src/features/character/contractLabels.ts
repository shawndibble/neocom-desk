import type { Contract } from '@/esi/endpoints';

export const CONTRACT_TYPE_KEY: Record<Contract['type'], string> = {
  unknown: 'contracts.typeUnknown',
  item_exchange: 'contracts.typeItemExchange',
  auction: 'contracts.typeAuction',
  courier: 'contracts.typeCourier',
  loan: 'contracts.typeLoan',
};

export const CONTRACT_STATUS_KEY: Record<Contract['status'], string> = {
  outstanding: 'contracts.statusOutstanding',
  in_progress: 'contracts.statusInProgress',
  finished_issuer: 'contracts.statusFinishedIssuer',
  finished_contractor: 'contracts.statusFinishedContractor',
  finished: 'contracts.statusFinished',
  cancelled: 'contracts.statusCancelled',
  rejected: 'contracts.statusRejected',
  failed: 'contracts.statusFailed',
  deleted: 'contracts.statusDeleted',
  reversed: 'contracts.statusReversed',
};

export const CONTRACT_AVAILABILITY_KEY: Record<Contract['availability'], string> = {
  public: 'contracts.availabilityPublic',
  personal: 'contracts.availabilityPersonal',
  corporation: 'contracts.availabilityCorporation',
  alliance: 'contracts.availabilityAlliance',
};
