import type { Contract } from '@/esi/endpoints';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from './contractLabels';

/**
 * The contracts filter bar's state (issue #417): status, type, and free text
 * against the issuer name or title. `null` (or an empty string for `text`)
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
 * Every active criterion is ANDed. Free text matches either the resolved
 * issuer name or the contract's own title, since either is what a search box
 * labeled "issuer or title" implies.
 */
export function filterContracts(
  contracts: readonly Contract[],
  filter: ContractsFilter,
  issuerNames: ReadonlyMap<number, string>
): Contract[] {
  const text = filter.text.trim().toLowerCase();
  return contracts.filter((contract) => {
    if (filter.status !== null && contract.status !== filter.status) return false;
    if (filter.type !== null && contract.type !== filter.type) return false;
    if (text !== '') {
      const issuerName = issuerNames.get(contract.issuer_id) ?? '';
      const title = contract.title ?? '';
      if (!issuerName.toLowerCase().includes(text) && !title.toLowerCase().includes(text)) {
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
