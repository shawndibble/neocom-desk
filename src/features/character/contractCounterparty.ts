import type { Contract } from '@/esi/endpoints';

export interface ContractReceiver {
  id: number;
  kind: 'character' | 'corporation' | 'alliance';
  /** `acceptor`: took the contract. `assignee`: only offered to them. */
  role: 'acceptor' | 'assignee';
}

function assigneeKind(contract: Contract): ContractReceiver['kind'] {
  return contract.availability === 'corporation'
    ? 'corporation'
    : contract.availability === 'alliance'
      ? 'alliance'
      : 'character';
}

/**
 * Who received a contract: the acceptor once accepted, else the assignee it
 * was offered to. Null for a public/unassigned contract and when the party is
 * the viewing pilot (the Issuer column already covers the other side).
 * An assignee's kind follows availability; ESI's `/universe/names` category
 * isn't cached, and availability says it for any non-public assignment.
 */
export function contractReceiver(contract: Contract, selfId: number): ContractReceiver | null {
  if (contract.acceptor_id !== 0 && contract.acceptor_id !== undefined) {
    if (contract.acceptor_id === selfId) return null;
    // A corp/alliance can accept what was assigned to it: same id, kind from availability.
    const kind =
      contract.acceptor_id === contract.assignee_id ? assigneeKind(contract) : 'character';
    return { id: contract.acceptor_id, kind, role: 'acceptor' };
  }
  const id = contract.assignee_id;
  if (!id || id === selfId) return null;
  return { id, kind: assigneeKind(contract), role: 'assignee' };
}
