import type { CachedResult } from '@/features/skills/data';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { maxMarketOrders } from '@/engine/market/orderSlots';
import { rememberSpSummary } from '@/stores/characterSp';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadStockBoard } from '@/features/stockTargets/stockBoard';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';

export interface WalletPanelData {
  result: CachedResult<number> | null;
  needsReauth: boolean;
}

export async function loadWalletPanel(characterId: number): Promise<WalletPanelData> {
  const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
  return { result: cached, needsReauth };
}

export interface SkillsQueuePanelData {
  skillsResult: CachedResult<CharacterSkills> | null;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  queueNeedsReauth: boolean;
  totalSp: number | null;
  catalog: SkillCatalog;
  maxOrders: number | null;
}

export async function loadSkillsQueuePanel(characterId: number): Promise<SkillsQueuePanelData> {
  const [corrected, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  rememberSpSummary(characterId, {
    totalSp: corrected.totalSp,
    unallocatedSp: corrected.skillsResult?.data.unallocated_sp ?? null,
  });
  return {
    skillsResult: corrected.skillsResult,
    queueResult: corrected.queueResult,
    queueNeedsReauth: corrected.queueNeedsReauth,
    totalSp: corrected.totalSp,
    catalog,
    maxOrders: corrected.skillsResult ? maxMarketOrders(corrected.trained) : null,
  };
}

export function loadOrdersBoard(characterId: number, signal: RouteSnapshotSignal) {
  return import('@/features/market/openOrdersSnapshotRows').then((m) =>
    m.loadOpenOrdersSnapshotLazy(characterId, signal)
  );
}

export const loadStockBoardFor = async () => {
  await import('@/features/market/openOrdersData')
    .then((m) => m.loadAllCharactersOpenOrders())
    .catch(() => undefined);
  return { board: await loadStockBoard() };
};
