/**
 * Stock Cost Basis for the Assets page (issue #6381): the unit cost of the
 * units the active Character holds, from their wallet buys and sells plus
 * their logged Production Runs. Derived on read — nothing is stored.
 */
import { db } from '@/db';
import { stockCostBasis } from '@/engine/market/stockCostBasis';
import type { ProductionLot, WalletTrade } from '@/engine/market/walletCostBasis';
import { hasWalletScope, loadWalletTransactionsHistory } from '@/features/character/wallet';
import { loadWalletArchiveInfo } from '@/features/character/walletArchive';
import { toWalletTrade } from '@/features/market/orderCostBasis';
import type { CharacterAsset } from '@/esi/endpoints';

export interface HeldStockCost {
  unitCost: number;
}

/** Units held per type, across every location the Character's own assets sit in. */
export function heldQuantityByType(
  assets: ReadonlyArray<Pick<CharacterAsset, 'type_id' | 'quantity'>>
): Map<number, number> {
  const held = new Map<number, number>();
  for (const a of assets) held.set(a.type_id, (held.get(a.type_id) ?? 0) + a.quantity);
  return held;
}

/**
 * Cost per held unit for every type the history covers; a type it does not
 * cover is simply absent. A Character without the wallet permission, or whose
 * wallet cannot be read, gets an empty map — never an error.
 */
export async function loadStockCostBases(
  characterId: number,
  assets: ReadonlyArray<Pick<CharacterAsset, 'type_id' | 'quantity'>>,
  nowMs: number = Date.now()
): Promise<Map<number, HeldStockCost>> {
  const out = new Map<number, HeldStockCost>();
  if (assets.length === 0 || !(await hasWalletScope(characterId))) return out;

  let wallet: Awaited<ReturnType<typeof loadWalletTransactionsHistory>>;
  try {
    wallet = await loadWalletTransactionsHistory(characterId);
  } catch {
    return out;
  }
  if (!wallet) return out;
  const [info, runRecords] = await Promise.all([
    loadWalletArchiveInfo(characterId, nowMs, 'transactions'),
    db.productionRuns.where('characterId').equals(characterId).toArray(),
  ]);
  // Only gaps between covered windows: the stretch since the last fetch is the next fetch's job.
  const gaps = info.gaps.filter(([, to]) => to < nowMs);

  const tradesByType = new Map<number, WalletTrade[]>();
  for (const t of wallet.data) {
    const list = tradesByType.get(t.type_id) ?? [];
    list.push(toWalletTrade(t));
    tradesByType.set(t.type_id, list);
  }
  const runsByType = new Map<number, ProductionLot[]>();
  for (const r of runRecords) {
    if (!(r.quantity > 0)) continue;
    const list = runsByType.get(r.productTypeID) ?? [];
    list.push({
      date: new Date(r.loggedAt).toISOString(),
      typeId: r.productTypeID,
      quantity: r.quantity,
      unitCost: r.totalCost / r.quantity,
    });
    runsByType.set(r.productTypeID, list);
  }

  for (const [typeId, held] of heldQuantityByType(assets)) {
    const trades = tradesByType.get(typeId) ?? [];
    const runs = runsByType.get(typeId) ?? [];
    if (trades.length === 0 && runs.length === 0) continue;
    const basis = stockCostBasis({
      trades,
      runs,
      typeId,
      held,
      gaps,
      truncated: wallet.truncated,
    });
    if (basis) out.set(typeId, { unitCost: basis.unitCost });
  }
  return out;
}
