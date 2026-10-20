import { getTradeHub } from '@/market/hubs';

/**
 * `systemName`, which hubs.ts keeps for exactly this — the full station name
 * ("Jita IV - Moon 4 - Caldari Navy Assembly Plant") would bury the sentence
 * it appears in and would not fit on a button at all.
 */
export function hubLabel(hubId: string): string {
  return getTradeHub(hubId)?.systemName ?? hubId;
}
