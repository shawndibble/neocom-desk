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
