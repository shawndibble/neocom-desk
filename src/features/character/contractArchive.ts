/**
 * Local contract archive. ESI returns a finished contract for only 30 days; every live
 * fetch of the Character's own contracts upserts its headers here and rows whose last date
 * is over 365 days old are pruned. Item lines are kept only for a contract the pilot opened
 * (never re-fetched for old ones). Device-local, not synced, not in the encrypted backup,
 * and not touched by "clear cache" — same footing as the wallet archive.
 */
import { captureException } from '@sentry/react';
import { db } from '@/db';
import type { Contract, ContractItem } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import { archiveCutoffIso } from '@/engine/wallet/archiveCoverage';
import { DAY_MS } from '@/lib/age';

/** The newest of a contract's dates: the clock the one-year prune runs on. */
export function contractArchiveDate(contract: Contract): string {
  return [
    contract.date_issued,
    contract.date_expired,
    contract.date_accepted,
    contract.date_completed,
  ].reduce<string>((newest, date) => (date && date > newest ? date : newest), '');
}

/** How long ESI returns a finished contract. */
const ESI_CONTRACT_DAYS = 30;

/** The contract's last date is past what ESI still sends, so its items are gone from ESI. */
export function pastEsiWindow(contract: Contract, nowMs: number = Date.now()): boolean {
  return Date.parse(contractArchiveDate(contract)) < nowMs - ESI_CONTRACT_DAYS * DAY_MS;
}

/** Drops rows past a year, with the item lines filed under them. */
async function prune(characterId: number, nowMs: number): Promise<void> {
  const stale = await db.contractArchive
    .where('[characterId+archiveDate]')
    .between([characterId, ''], [characterId, archiveCutoffIso(nowMs)], true, false)
    .primaryKeys();
  if (stale.length === 0) return;
  await db.contractArchive.bulkDelete(stale);
  await db.contractItemArchive.bulkDelete(stale);
}

/**
 * Upserts a live fetch and prunes past a year. Never throws. A saved copy is skipped: it
 * holds rows an earlier live fetch already archived.
 */
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

/** Keeps the item lines of a contract the pilot opened. Never throws. */
export async function archiveContractItems(
  characterId: number,
  contractId: number,
  items: readonly ContractItem[]
): Promise<void> {
  try {
    // Only for a contract the archive holds: a row with no header would never be pruned.
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

/** The item lines kept for a contract, or null when none were. */
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

/**
 * The live result with archived contracts folded in (live wins on a shared id); a result
 * built from the archive alone when nothing live came back.
 */
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
  // Stamped with the newest thing seen, not now: Data Age must not claim a fresh fetch.
  const newest = Math.max(0, ...archived.map((c) => Date.parse(contractArchiveDate(c))));
  return { data: archived, fetchedAt: new Date(newest), fromCache: true, truncated: false };
}

/** Drops a Character's archive. Call inside a Dexie transaction that includes these tables. */
export async function clearContractArchive(characterId: number): Promise<void> {
  await db.contractArchive.where('characterId').equals(characterId).delete();
  await db.contractItemArchive.where('characterId').equals(characterId).delete();
}
