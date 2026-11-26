export async function corpTickerOrId(corporationId: number): Promise<string> {
  try {
    const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
    return (await loadPublicCorporationRecord(corporationId))?.ticker || String(corporationId);
  } catch {
    return String(corporationId);
  }
}

export interface CorpLabel {
  ticker: string;
  name: string;
}

export function corpLabelText(corp: CorpLabel): string {
  return `${corp.name} [${corp.ticker}]`;
}

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
