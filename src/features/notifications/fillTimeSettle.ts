/**
 * Re-dates `marketOrderFilled` feed rows to the sale that emptied the order.
 *
 * The poll that notices a fill can't date it — ESI never says when an order
 * filled — so `recordFeedNotification` writes the row at the poll's time with
 * a `fillMatch`, and the Alerts page marks it provisional. Each later poll
 * runs this: it reads the wallet transactions, asks `engine/market/fillTime`
 * whether the sale is visible yet, and once it is, moves `firedAt` back to it
 * and stamps `fillSettledAt`. The wallet refreshes hourly, so a row usually
 * settles within the hour.
 *
 * A row settles without a re-date when the answer can never come: the wallet
 * scope is missing or revoked, provably fresh data holds no matching sale, or
 * the row has aged past what the transactions endpoint returns. Leaving those
 * marked provisional would promise an update that is not coming.
 */
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { inBackgroundLane } from '@/esi/lane';
import type { WalletTransaction } from '@/esi/endpoints';
import { loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { resolveFillTime, type FillTransaction } from '@/engine/market/fillTime';
import { scheduleSync } from '@/sync';
import { isProvisionalFill, type ProvisionalFillRow } from './feed';

const WALLET_SCOPE = ESI_REGISTRY.getCharacterWalletTransactions.scope;

/** ESI's transactions endpoint reaches back about a month; a row older than that will never find its sale. */
const SETTLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** What the wallet said, or why it can never say. */
export type WalletReading =
  | { kind: 'transactions'; rows: readonly FillTransaction[]; fetchedAtMs: number }
  /** No scope, or the grant was revoked: no later poll will do better. */
  | { kind: 'unavailable' }
  /** A transient failure — leave everything for the next poll. */
  | { kind: 'retry' };

export interface FillSettlement {
  id: string;
  firedAt: number;
}

/** Which rows conclude this poll, and the date each settles on. Pure. */
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
  // Background at the ESI gate, like every other poll fetch (issue #2271).
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

/**
 * One Character's pass. Reads the wallet only when that Character has a
 * provisional row, so the common case costs one indexed Dexie query. Never
 * throws: a failure here must not cost the rest of the poll.
 */
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
            // Never later than it was: `mergeFeedRecord` keeps the earlier date anyway.
            row.firedAt = Math.min(row.firedAt, firedAt);
            row.fillSettledAt = nowMs;
            // The remote copy is now out of date — clearing this is what makes
            // `sync/merge.mergeFeed` push the row again.
            delete row.syncedAt;
          });
      }
    });
    scheduleSync(characterId);
  } catch {
    // Retried on the next poll: the rows are still provisional.
  }
}
