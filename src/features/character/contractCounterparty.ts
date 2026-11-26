import type { Contract, UniverseName } from '@/esi/endpoints';

type KnownCategories = ReadonlyMap<number, UniverseName['category']>;

const RECEIVER_KINDS = new Set<string>(['character', 'corporation', 'alliance']);

export function contractIssuer(contract: Contract): {
  id: number;
  kind: 'character' | 'corporation';
} {
  return contract.for_corporation && contract.issuer_corporation_id
    ? { id: contract.issuer_corporation_id, kind: 'corporation' }
    : { id: contract.issuer_id, kind: 'character' };
}

export interface ContractReceiver {
  id: number;
  kind: 'character' | 'corporation' | 'alliance';
  role: 'acceptor' | 'assignee';
}

function assigneeKind(contract: Contract): ContractReceiver['kind'] {
  return contract.availability === 'corporation'
    ? 'corporation'
    : contract.availability === 'alliance'
      ? 'alliance'
      : 'character';
}

export function contractReceiver(
  contract: Contract,
  selfId: number,
  categories?: KnownCategories
): ContractReceiver | null {
  const known = (id: number, fallback: ContractReceiver['kind']): ContractReceiver['kind'] => {
    const category = categories?.get(id);
    return category !== undefined && RECEIVER_KINDS.has(category)
      ? (category as ContractReceiver['kind'])
      : fallback;
  };
  if (contract.acceptor_id !== 0 && contract.acceptor_id !== undefined) {
    if (contract.acceptor_id === selfId) return null;
    const fallback =
      contract.acceptor_id === contract.assignee_id ? assigneeKind(contract) : 'character';
    return {
      id: contract.acceptor_id,
      kind: known(contract.acceptor_id, fallback),
      role: 'acceptor',
    };
  }
  const id = contract.assignee_id;
  if (!id || id === selfId) return null;
  return { id, kind: known(id, assigneeKind(contract)), role: 'assignee' };
}
