/**
 * The From/To hubs Hauling Opportunities opens on when the URL names none:
 * From is the pilot's default Trade Hub (Settings > Market, `sync.marketHub`),
 * To is Jita — the deepest market to sell into — or Amarr when From already is
 * Jita, so the two never coincide. A Jita pilot sees the lane the tab always
 * opened on. The URL still wins (ADR 0015).
 */
import type { TradeHub } from '@/market/hubs';

export function haulingHubDefaults(hubId: TradeHub['id']): {
  from: TradeHub['id'];
  to: TradeHub['id'];
} {
  return { from: hubId, to: hubId === 'jita' ? 'amarr' : 'jita' };
}

export interface HaulingLane {
  from: TradeHub['id'];
  to: TradeHub['id'];
}

/**
 * The URL patch for picking `id` at one end of the lane. Picking the hub the
 * other end already holds swaps the two: To's default follows the pilot's
 * Trade Hub, so a From pick can otherwise land on it and leave a same-hub
 * dead end the pilot never chose.
 */
export function pickHaulingHub(
  lane: HaulingLane,
  end: 'from' | 'to',
  id: TradeHub['id']
): Partial<HaulingLane> {
  const other = end === 'from' ? 'to' : 'from';
  return lane[other] === id ? { [end]: id, [other]: lane[end] } : { [end]: id };
}
