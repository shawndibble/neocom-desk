import { getAbyssalEstimate } from '@/market/mutamarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface AbyssalContractValue {
  estimated: number;
  priced: number;
  unpriced: number;
}

export interface AbyssalLine {
  type_id: number;
  item_id?: number;
}

export interface AbyssalPricing {
  characterId: number | null;
  isCancelled?: () => boolean;
}

const LOOKUP_WORKERS = 4;

export async function loadAbyssalContractValue(
  lines: readonly AbyssalLine[],
  { characterId, isCancelled = () => false }: AbyssalPricing
): Promise<AbyssalContractValue> {
  const values: (number | null)[] = lines.map(() => null);
  if (characterId === null) return { estimated: 0, priced: 0, unpriced: lines.length };
  let unavailable = false;
  await mapWithConcurrencyLimit(
    lines.map((line, index) => ({ line, index })),
    LOOKUP_WORKERS,
    async ({ line, index }) => {
      if (unavailable || isCancelled()) return;
      if (line.item_id === undefined) return;
      const estimate = await getAbyssalEstimate(line.type_id, line.item_id, { characterId });
      if (estimate.status === 'unavailable') unavailable = true;
      values[index] = estimate.value;
    }
  );
  const priced = values.filter((value): value is number => value !== null);
  return {
    estimated: priced.reduce((sum, value) => sum + value, 0),
    priced: priced.length,
    unpriced: values.length - priced.length,
  };
}
