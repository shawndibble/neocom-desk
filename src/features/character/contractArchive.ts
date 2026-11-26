import { captureException } from '@sentry/react';
import { db } from '@/db';
import type { Contract, ContractItem } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import { archiveCutoffIso } from '@/engine/wallet/archiveCoverage';
import { DAY_MS } from '@/lib/age';

export function contractArchiveDate(contract: Contract): string {
  return [
    contract.date_issued,
    contract.date_expired,
    contract.date_accepted,
    contract.date_completed,
  ].reduce<string>((newest, date) => (date && date > newest ? date : newest), '');
}

const ESI_CONTRACT_DAYS = 30;

export function pastEsiWindow(contract: Contract, nowMs: number = Date.now()): boolean {
  return Date.parse(contractArchiveDate(contract)) < nowMs - ESI_CONTRACT_DAYS * DAY_MS;
}

async function prune(characterId: number, nowMs: number): Promise<void> {
  const stale = await db.contractArchive
    .where('[characterId+archiveDate]')
    .between([characterId, ''], [characterId, archiveCutoffIso(nowMs)], true, false)
    .primaryKeys();
  if (stale.length === 0) return;
  await db.contractArchive.bulkDelete(stale);
  await db.contractItemArchive.bulkDelete(stale);
}

export async function archiveContracts(
  characterId: number,
  result: CachedResult<Contract[]> | null,
  nowMs: number = Date.now()
): Promise<void> {
  if (!result || result.fromCache) return;
  try {
    await db.transaction('rw', db.contractArchive, db.contractItemArchive, async () => {
      await db.contractArchive.bulkPut(
        result.data.map((contract) => ({
          ...contract,
          characterId,
          archiveDate: contractArchiveDate(contract),
        }))
      );
      await prune(characterId, nowMs);
    });
  } catch (error) {
    captureException(error);
  }
}

export async function archiveContractItems(
  characterId: number,
  contractId: number,
  items: readonly ContractItem[]
): Promise<void> {
  try {
    await db.transaction('rw', db.contractArchive, db.contractItemArchive, async () => {
      if ((await db.contractArchive.get([characterId, contractId])) === undefined) return;
      await db.contractItemArchive.put({
        characterId,
        contract_id: contractId,
        items: [...items],
      });
    });
  } catch (error) {
    captureException(error);
  }
}

export async function archivedContractItems(
  characterId: number,
  contractId: number
): Promise<ContractItem[] | null> {
  try {
    return (await db.contractItemArchive.get([characterId, contractId]))?.items ?? null;
  } catch (error) {
    captureException(error);
    return null;
  }
}

export async function contractsWithArchive(
  characterId: number,
  live: CachedResult<Contract[]> | null
): Promise<CachedResult<Contract[]> | null> {
  let archived: Contract[];
  try {
    const rows = await db.contractArchive.where('characterId').equals(characterId).toArray();
    archived = rows.map((row) => {
      const rest: Partial<typeof row> = { ...row };
      delete rest.characterId;
      delete rest.archiveDate;
      return rest as Contract;
    });
  } catch (error) {
    captureException(error);
    return live;
  }
  if (live) {
    if (archived.length === 0) return live;
    const liveIds = new Set(live.data.map((c) => c.contract_id));
    return {
      ...live,
      data: [...live.data, ...archived.filter((c) => !liveIds.has(c.contract_id))],
    };
  }
  if (archived.length === 0) return null;
  const newest = Math.max(0, ...archived.map((c) => Date.parse(contractArchiveDate(c))));
  return { data: archived, fetchedAt: new Date(newest), fromCache: true, truncated: false };
}

export async function clearContractArchive(characterId: number): Promise<void> {
  await db.contractArchive.where('characterId').equals(characterId).delete();
  await db.contractItemArchive.where('characterId').equals(characterId).delete();
}
