/** The corporation's ticker, for an export's file name; its id when it can't be read. */
export async function corpTickerOrId(corporationId: number): Promise<string> {
  try {
    // Cached public record, loaded on demand like the other corp callers of it.
    const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
    return (await loadPublicCorporationRecord(corporationId))?.ticker || String(corporationId);
  } catch {
    return String(corporationId);
  }
}
