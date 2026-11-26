import { DAY_MS } from '@/lib/age';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { inBackgroundLane } from '@/esi/lane';
import type { WalletTransaction } from '@/esi/endpoints';
import { loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { resolveFillTime, type FillTransaction } from '@/engine/market/fillTime';
import { scheduleSync } from '@/sync';
import { isProvisionalFill, type ProvisionalFillRow } from './feed';

const WALLET_SCOPE = ESI_REGISTRY.getCharacterWalletTransactions.scope;

const SETTLE_WINDOW_MS = 30 * DAY_MS;

export type WalletReading =
  | { kind: 'transactions'; rows: readonly FillTransaction[]; fetchedAtMs: number }
  | { kind: 'unavailable' }
  | { kind: 'retry' };

export interface FillSettlement {
  id: string;
  firedAt: number;
}

export function planFillSettlements(
  rows: readonly ProvisionalFillRow[],
  wallet: WalletReading,
  nowMs: number
): FillSettlement[] {
  if (wallet.kind === 'retry') return [];
  const settlements: FillSettlement[] = [];
  for (const row of rows) {
    const settleAsNoticed = { id: row.id, firedAt: row.firedAt };
    if (wallet.kind === 'unavailable' || nowMs - row.firedAt > SETTLE_WINDOW_MS) {
      settlements.push(settleAsNoticed);
      continue;
    }
    const result = resolveFillTime(row.fillMatch, wallet.rows, row.firedAt, wallet.fetchedAtMs);
    if (result.status === 'settled') settlements.push({ id: row.id, firedAt: result.fillMs });
    else if (result.status === 'unmatched') settlements.push(settleAsNoticed);
  }
  return settlements;
}

function toFillTransaction(row: WalletTransaction): FillTransaction {
  return {
    dateMs: Date.parse(row.date),
    typeId: row.type_id,
    locationId: row.location_id,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    isBuy: row.is_buy,
  };
}

async function readWallet(
  characterId: number,
  scopes: ReadonlySet<string>
): Promise<WalletReading> {
  if (!scopes.has(WALLET_SCOPE)) return { kind: 'unavailable' };
  const { cached, needsReauth } = await inBackgroundLane(() =>
    loadWalletTransactionsWithStatus(characterId)
  );
  if (needsReauth) return { kind: 'unavailable' };
  if (cached === null) return { kind: 'retry' };
  return {
    kind: 'transactions',
    rows: cached.data.map(toFillTransaction),
    fetchedAtMs: cached.fetchedAt.getTime(),
  };
}

export async function settleFillTimes(
  characterId: number,
  scopes: ReadonlySet<string>,
  nowMs: number
): Promise<void> {
  try {
    const rows = (
      await db.notificationFeed.where('characterId').equals(characterId).toArray()
    ).filter(isProvisionalFill);
    if (rows.length === 0) return;

    const settlements = planFillSettlements(rows, await readWallet(characterId, scopes), nowMs);
    if (settlements.length === 0) return;

    await db.transaction('rw', db.notificationFeed, async () => {
      for (const { id, firedAt } of settlements) {
        await db.notificationFeed
          .where('id')
          .equals(id)
          .modify((row) => {
            row.firedAt = Math.min(row.firedAt, firedAt);
            row.fillSettledAt = nowMs;
            delete row.syncedAt;
          });
      }
    });
    scheduleSync(characterId, { collections: ['notificationFeed'] });
  } catch {}
}
