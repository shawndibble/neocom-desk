import { getTradeHub } from '@/market/hubs';

export function hubLabel(hubId: string): string {
  return getTradeHub(hubId)?.systemName ?? hubId;
}
