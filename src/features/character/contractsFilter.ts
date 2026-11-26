import type { TFunction } from 'i18next';
import type { ActiveFilter } from '@/components/ui';
import type { Contract } from '@/esi/endpoints';
import { contractIssuer, contractReceiver } from './contractCounterparty';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from './contractLabels';

export interface ContractsFilter {
  status: Contract['status'] | null;
  type: Contract['type'] | null;
  text: string;
}

export const EMPTY_CONTRACTS_FILTER: ContractsFilter = {
  status: null,
  type: null,
  text: '',
};

export function filterContracts(
  contracts: readonly Contract[],
  filter: ContractsFilter,
  issuerNames: ReadonlyMap<number, string>,
  selfId?: number | ((contract: Contract) => number | undefined)
): Contract[] {
  const text = filter.text.trim().toLowerCase();
  return contracts.filter((contract) => {
    if (filter.status !== null && contract.status !== filter.status) return false;
    if (filter.type !== null && contract.type !== filter.type) return false;
    if (text !== '') {
      const issuerName = issuerNames.get(contractIssuer(contract).id) ?? '';
      const self = typeof selfId === 'function' ? selfId(contract) : selfId;
      const receiver = self === undefined ? null : contractReceiver(contract, self);
      const receiverName = receiver ? (issuerNames.get(receiver.id) ?? '') : '';
      const title = contract.title ?? '';
      if (
        !issuerName.toLowerCase().includes(text) &&
        !receiverName.toLowerCase().includes(text) &&
        !title.toLowerCase().includes(text)
      ) {
        return false;
      }
    }
    return true;
  });
}

export function contractStatusOptions(contracts: readonly Contract[]): Contract['status'][] {
  const present = new Set(contracts.map((contract) => contract.status));
  return (Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][]).filter((status) =>
    present.has(status)
  );
}

export function contractTypeOptions(contracts: readonly Contract[]): Contract['type'][] {
  const present = new Set(contracts.map((contract) => contract.type));
  return (Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][]).filter((type) => present.has(type));
}

export function activeContractsFilters(
  filter: ContractsFilter,
  t: TFunction
): ActiveFilter<ContractsFilter>[] {
  const active: ActiveFilter<ContractsFilter>[] = [];
  if (filter.status !== null)
    active.push({
      label: t('contracts.statusFilterLabel'),
      value: t(CONTRACT_STATUS_KEY[filter.status]),
      clear: (value) => ({ ...value, status: null }),
    });
  if (filter.type !== null)
    active.push({
      label: t('contracts.typeFilterLabel'),
      value: t(CONTRACT_TYPE_KEY[filter.type]),
      clear: (value) => ({ ...value, type: null }),
    });
  return active;
}

export function isContractsFilterActive(filter: ContractsFilter): boolean {
  return filter.text.trim() !== '' || filter.status !== null || filter.type !== null;
}
