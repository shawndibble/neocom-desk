import type { TFunction } from 'i18next';
import type { ActiveFilter } from '@/components/ui';
import type { Contract } from '@/esi/endpoints';
import { contractIssuer, contractReceiver } from './contractCounterparty';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from './contractLabels';

/**
 * The contracts filter bar's state (issue #417): status, type, and free text
 * against the issuer name, receiver name or title. `null` (or an empty string for `text`)
 * means that criterion is inactive — every field inactive is the identity
 * filter, same shape as `WalletJournalFilter`.
 */
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

/**
 * Every active criterion is ANDed. Free text matches the resolved
 * issuer or receiver name, or the contract's own title, since either is what a search box
 * labeled "issuer or title" implies.
 */
export function filterContracts(
  contracts: readonly Contract[],
  filter: ContractsFilter,
  issuerNames: ReadonlyMap<number, string>,
  /** Whose receiver a row has: one id, or per row for a list read for several Characters. */
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

/** The distinct statuses present in a contract list, in `CONTRACT_STATUS_KEY`'s canonical order. */
export function contractStatusOptions(contracts: readonly Contract[]): Contract['status'][] {
  const present = new Set(contracts.map((contract) => contract.status));
  return (Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][]).filter((status) =>
    present.has(status)
  );
}

/** The distinct types present in a contract list, in `CONTRACT_TYPE_KEY`'s canonical order. */
export function contractTypeOptions(contracts: readonly Contract[]): Contract['type'][] {
  const present = new Set(contracts.map((contract) => contract.type));
  return (Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][]).filter((type) => present.has(type));
}

/**
 * The criteria set away from their default, as `FilterBar` pills — status
 * first, since it is what a reader scans the History by. Text is left out:
 * the search box already shows what it holds.
 */
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

/**
 * Whether any criterion actually narrows the list — what decides if a
 * zero-match empty state offers "Reset filters" (issue #1466). Unlike the
 * pills, text counts here; whitespace-only text doesn't, since
 * `filterContracts` trims it away.
 */
export function isContractsFilterActive(filter: ContractsFilter): boolean {
  return filter.text.trim() !== '' || filter.status !== null || filter.type !== null;
}
