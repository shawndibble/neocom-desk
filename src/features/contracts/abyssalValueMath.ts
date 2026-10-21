/**
 * An abyssal (mutated) module's value on a contract. It has no market price,
 * since it is worth its own rolls, so it stays out of the price check's hub
 * figure and is valued apart, at its own MutaMarket estimate (looked up, never
 * imported) when the line carries an item id. A Character's own contract lines
 * carry none, so there they read as not priced, and why.
 */
import { getAbyssalEstimate } from '@/market/mutamarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface AbyssalContractValue {
  /** ISK: the priced modules' MutaMarket estimates, summed. */
  estimated: number;
  priced: number;
  /** No estimate: no item id on the line, no Character to ask with, or MutaMarket has none. */
  unpriced: number;
}

/** The two fields the lookup needs, structurally, so any contract's line type fits. */
export interface AbyssalLine {
  type_id: number;
  /** The module's own item id (public contracts only), which its estimate needs. */
  item_id?: number;
}

export interface AbyssalPricing {
  /** The Character whose session reaches MutaMarket; null asks nothing. */
  characterId: number | null;
  /** True once the view closed: lookups not yet started are dropped. */
  isCancelled?: () => boolean;
}

const LOOKUP_WORKERS = 4;

export async function loadAbyssalContractValue(
  lines: readonly AbyssalLine[],
  { characterId, isCancelled = () => false }: AbyssalPricing
): Promise<AbyssalContractValue> {
  const values: (number | null)[] = lines.map(() => null);
  if (characterId === null) return { estimated: 0, priced: 0, unpriced: lines.length };
  // A few at a time, stopping at the first `unavailable`: the rest would only fail too.
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
