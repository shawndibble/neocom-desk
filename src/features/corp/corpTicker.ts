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

/** How a row names its corporation: the ticker, with the full name for its tooltip. */
export interface CorpLabel {
  ticker: string;
  name: string;
}

/** A corporation written out in full: "Main Corp [MAIN]". */
export function corpLabelText(corp: CorpLabel): string {
  return `${corp.name} [${corp.ticker}]`;
}

/** Each corporation's label; one whose public record cannot be read is named by its id. */
export async function loadCorpLabels(
  corporationIds: readonly number[]
): Promise<Map<number, CorpLabel>> {
  const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
  const labels = await Promise.all(
    corporationIds.map(async (corporationId): Promise<[number, CorpLabel]> => {
      const fallback = { ticker: String(corporationId), name: String(corporationId) };
      try {
        const record = await loadPublicCorporationRecord(corporationId);
        return [
          corporationId,
          record ? { ticker: record.ticker || fallback.ticker, name: record.name } : fallback,
        ];
      } catch {
        return [corporationId, fallback];
      }
    })
  );
  return new Map(labels);
}
