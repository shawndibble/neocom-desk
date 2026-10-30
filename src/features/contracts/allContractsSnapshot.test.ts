import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { Contract } from '@/esi/endpoints';
import { contractReceiver } from '@/features/character/contractCounterparty';
import { allContractsView } from './contractsHistoryView';
import {
  loadAllContractsSnapshot,
  mergeCharacterContracts,
  type CharacterContracts,
} from './allContractsSnapshot';

const loadContracts = vi.hoisted(() => vi.fn());
const loadContacts = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/contracts', () => ({
  loadContractsWithArchive: loadContracts,
}));
vi.mock('@/features/character/contacts', () => ({ loadContacts }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn(async () => new Map()),
  resolveCategories: vi.fn(async () => new Map()),
}));
vi.mock('@/features/character/affiliations', () => ({
  resolveAffiliations: vi.fn(async () => new Map()),
}));

const CONTRACTS = 'esi-contracts.read_character_contracts.v1';
const CONTACTS = 'esi-characters.read_contacts.v1';
const signal = { cancelled: false };

function contract(id: number, issuer: number, assignee: number, acceptor = 0): Contract {
  return {
    contract_id: id,
    issuer_id: issuer,
    issuer_corporation_id: 2,
    assignee_id: assignee,
    acceptor_id: acceptor,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: '2026-08-01T00:00:00Z',
    date_expired: '2099-08-10T00:00:00Z',
  } as Contract;
}

function entry(characterId: number, contracts: Contract[]): CharacterContracts {
  return {
    characterId,
    characterName: `Pilot ${characterId}`,
    contracts,
    needsReauth: false,
    truncated: false,
    fetchedAt: 1,
    fromCache: false,
  };
}

describe('mergeCharacterContracts', () => {
  it('lists a contract between two own Characters once, under its issuer', () => {
    const shared = contract(7, 2, 1);
    const merged = mergeCharacterContracts([entry(1, [shared]), entry(2, [shared])]);
    expect(merged.contracts).toHaveLength(1);
    expect(merged.ownerByContractId.get(7)).toBe(2);
  });

  it('gives a contract from a stranger to the first Character that read it', () => {
    const merged = mergeCharacterContracts([entry(1, [contract(8, 999, 1)]), entry(2, [])]);
    expect(merged.ownerByContractId.get(8)).toBe(1);
  });
});

describe('loadAllContractsSnapshot', () => {
  beforeEach(async () => {
    loadContracts.mockReset();
    loadContacts.mockReset();
    loadContacts.mockResolvedValue({ cached: { data: [] } });
    await db.characters.clear();
    await db.tokens.clear();
    for (const [characterId, scopes] of [
      [1, [CONTRACTS, CONTACTS]],
      [2, [CONTRACTS]],
      [3, []],
    ] as const) {
      await db.characters.put({
        characterId,
        name: `Pilot ${characterId}`,
        ownerHash: 'h',
        addedAt: 1,
      });
      await db.tokens.put({
        characterId,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 3_600_000,
        scopes: [...scopes],
      });
    }
    loadContracts.mockImplementation(async (id: number) => ({
      cached: {
        data: id === 1 ? [contract(10, 1, 2)] : [contract(10, 1, 2), contract(11, 2, 999)],
        fetchedAt: new Date(1000 * id),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    }));
  });

  it('reads once per Character holding the scope and skips the rest', async () => {
    const snapshot = await loadAllContractsSnapshot(1, signal);
    expect(loadContracts.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2]);
    expect(snapshot.skipped).toEqual([{ characterId: 3, name: 'Pilot 3' }]);
  });

  it('dedupes and reads each row relative to the Character it came from', async () => {
    const snapshot = await loadAllContractsSnapshot(1, signal);
    expect(snapshot.contractsResult?.data.map((c) => c.contract_id).sort()).toEqual([10, 11]);
    expect(snapshot.contractsResult?.fetchedAt).toEqual(new Date(1000));
    const view = allContractsView(snapshot);
    const byId = new Map(snapshot.contractsResult?.data.map((c) => [c.contract_id, c]));
    // 10 is Pilot 1's own, offered to Pilot 2: its receiver is Pilot 2.
    expect(view.ownerOf(byId.get(10)!)).toBe(1);
    expect(contractReceiver(byId.get(10)!, view.ownerOf(byId.get(10)!)!)?.id).toBe(2);
    // 11 is Pilot 2's, offered to a stranger; read against Pilot 1 the receiver would differ.
    expect(view.ownerOf(byId.get(11)!)).toBe(2);
    expect(view.characterNameOf?.(byId.get(11)!)).toBe('Pilot 2');
  });

  it('reads contacts only for Characters holding the contacts scope', async () => {
    await loadAllContractsSnapshot(1, signal);
    expect(loadContacts.mock.calls.map((c) => c[0])).toEqual([1]);
  });
});
