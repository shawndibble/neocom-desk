/**
 * The Overview's own reads, moved out of the route so a widget can use them
 * (a widget cannot import from a route).
 *
 * Every one of these closes over nothing but its arguments, which is
 * `useRouteSnapshot`'s stated contract for a loader. They stay module-level
 * functions for that reason: the hook is handed one stable function.
 */
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
  /**
   * Open-order ceiling for the Open orders widget's slot count. Derived here
   * rather than in its own snapshot: the Trade-group skill levels it needs are
   * already in this load's corrected skills, so it costs no extra ESI read.
   * Null until /skills has landed - an untrained character still has slots, so
   * "5" and "not loaded yet" must not look alike.
   */
  maxOrders: number | null;
}

export async function loadSkillsQueuePanel(characterId: number): Promise<SkillsQueuePanelData> {
  const [corrected, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  // Feeds the same cache `characterSp.ts` keeps for Clones/Employment History,
  // so switching to either of those tabs can seed the shared header from this
  // read instead of blanking it while its own load is in flight.
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

/**
 * Deferred because Overview is what the app opens on, so its static imports
 * are in the way of every first paint, and the Orders fetch layer reaches type
 * names, corrected skills, the NPC station table, cost bases and the
 * competition loaders for three counts.
 */
export function loadOrdersBoard(characterId: number, signal: RouteSnapshotSignal) {
  return import('@/features/market/openOrdersSnapshotRows').then((m) =>
    m.loadOpenOrdersSnapshotLazy(characterId, signal)
  );
}

/**
 * Stock Lists are account-wide: the widget reads the same lists for every Character.
 *
 * The counts read the cached open-orders lists, which the Orders read fills. The old
 * board always ran that read; a layout with Market stock but no Open orders widget
 * must not leave the counts unknown for ever, so fill the cache first (a cached,
 * shared read, so the Orders widget's own load costs nothing extra). A failure here
 * only leaves the counts unknown, which the widget says.
 */
export const loadStockBoardFor = async () => {
  await import('@/features/market/openOrdersData')
    .then((m) => m.loadAllCharactersOpenOrders())
    .catch(() => undefined);
  return { board: await loadStockBoard() };
};
