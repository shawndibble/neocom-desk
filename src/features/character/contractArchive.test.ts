import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { Contract, ContractItem } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import {
  archiveContractItems,
  archiveContracts,
  archivedContractItems,
  clearContractArchive,
  contractArchiveDate,
  contractsWithArchive,
  pastEsiWindow,
} from './contractArchive';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => `${new Date(NOW - daysAgo * DAY).toISOString().slice(0, 19)}Z`;

function contract(id: number, daysAgo: number, extra: Partial<Contract> = {}): Contract {
  return {
    contract_id: id,
    issuer_id: 1,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'finished',
    for_corporation: false,
    availability: 'personal',
    date_issued: iso(daysAgo),
    date_expired: iso(daysAgo),
    ...extra,
  };
}

function live(data: Contract[], fromCache = false): CachedResult<Contract[]> {
  return { data, fetchedAt: new Date(NOW), fromCache, truncated: false };
}

beforeEach(async () => {
  await db.contractArchive.clear();
  await db.contractItemArchive.clear();
});

describe('contractArchiveDate', () => {
  it('is the newest date on the contract', () => {
    const c = contract(1, 40, { date_completed: iso(10) });
    expect(contractArchiveDate(c)).toBe(iso(10));
  });
});

describe('pastEsiWindow', () => {
  it('is true only once the last date is over 30 days old', () => {
    expect(pastEsiWindow(contract(1, 31), NOW)).toBe(true);
    expect(pastEsiWindow(contract(1, 29), NOW)).toBe(false);
  });
});

describe('contract archive', () => {
  it('keeps a contract after ESI stops returning it', async () => {
    await archiveContracts(7, live([contract(1, 5)]), NOW);
    const merged = await contractsWithArchive(7, live([contract(2, 1)]));
    expect(merged?.data.map((c) => c.contract_id).sort()).toEqual([1, 2]);
  });

  it('lets the live row win on a shared id and strips archive fields', async () => {
    await archiveContracts(7, live([contract(1, 5, { status: 'outstanding' })]), NOW);
    const merged = await contractsWithArchive(7, live([contract(1, 5, { status: 'finished' })]));
    expect(merged?.data).toHaveLength(1);
    expect(merged?.data[0].status).toBe('finished');
    const solo = await contractsWithArchive(7, null);
    expect(solo?.data[0]).not.toHaveProperty('characterId');
    expect(solo?.data[0]).not.toHaveProperty('archiveDate');
    expect(solo?.fromCache).toBe(true);
  });

  it('is empty-null when nothing live and nothing archived', async () => {
    expect(await contractsWithArchive(7, null)).toBeNull();
  });

  it('skips a saved copy', async () => {
    await archiveContracts(7, live([contract(1, 5)], true), NOW);
    expect(await db.contractArchive.count()).toBe(0);
  });

  it('prunes rows past 365 days with their items, per Character', async () => {
    await archiveContracts(7, live([contract(1, 400), contract(2, 100)]), NOW - 300 * DAY);
    await archiveContracts(8, live([contract(3, 5)]), NOW);
    await archiveContractItems(7, 1, [{ record_id: 1 } as ContractItem]);
    await archiveContracts(7, live([]), NOW);
    const ids = (await db.contractArchive.toArray()).map((r) => [r.characterId, r.contract_id]);
    expect(ids.sort()).toEqual([
      [7, 2],
      [8, 3],
    ]);
    expect(await db.contractItemArchive.count()).toBe(0);
  });

  it('keeps items only for an archived contract and reads them back', async () => {
    await archiveContractItems(7, 1, [{ record_id: 1 } as ContractItem]);
    expect(await archivedContractItems(7, 1)).toBeNull();
    await archiveContracts(7, live([contract(1, 5)]), NOW);
    await archiveContractItems(7, 1, [{ record_id: 1 } as ContractItem]);
    expect(await archivedContractItems(7, 1)).toHaveLength(1);
  });

  it('clears one Character', async () => {
    await archiveContracts(7, live([contract(1, 5)]), NOW);
    await archiveContracts(8, live([contract(2, 5)]), NOW);
    await db.transaction('rw', db.contractArchive, db.contractItemArchive, () =>
      clearContractArchive(7)
    );
    expect((await db.contractArchive.toArray()).map((r) => r.characterId)).toEqual([8]);
  });
});
