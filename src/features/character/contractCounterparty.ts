import type { Contract, UniverseName } from '@/esi/endpoints';

type KnownCategories = ReadonlyMap<number, UniverseName['category']>;

const RECEIVER_KINDS = new Set<string>(['character', 'corporation', 'alliance']);

/** The party that issued a contract: the corp when issued on its behalf (`issuer_id` is then only the pilot who clicked), else the pilot. */
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
 * With the resolved `/universe/names` category the kind is exact; without it
 * (not yet resolved, or the lookup failed) an assignee's kind follows
 * availability and an acceptor is taken for a character.
 */
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
    // A corp/alliance can accept what was assigned to it: same id, kind from availability.
    // A public contract can be taken by a corp too; the resolved category says so.
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
