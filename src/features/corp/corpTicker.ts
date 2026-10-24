import { getCorporationPublicInfo } from '@/esi/endpoints/corp';

/** The corporation's ticker, for an export's file name; its id when ESI can't say. */
export async function corpTickerOrId(corporationId: number): Promise<string> {
  try {
    const result = await getCorporationPublicInfo(corporationId);
    return result.data?.ticker || String(corporationId);
  } catch {
    return String(corporationId);
  }
}
