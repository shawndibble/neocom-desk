import type { OreLine } from './types';

/** `from` with `take` removed, type by type (several lines of one type all count); empty lines drop. */
export function minusLines(
  from: readonly OreLine[],
  take: readonly OreLine[] | undefined
): OreLine[] {
  const gone = new Map<number, number>();
  for (const l of take ?? []) gone.set(l.typeId, (gone.get(l.typeId) ?? 0) + l.quantity);
  return from
    .map((l) => ({ typeId: l.typeId, quantity: l.quantity - (gone.get(l.typeId) ?? 0) }))
    .filter((l) => l.quantity > 0);
}

/** `a` and `b` added together, type by type; empty lines drop, sorted by type. */
export function addLines(a: readonly OreLine[], b: readonly OreLine[] | undefined): OreLine[] {
  const total = new Map<number, number>();
  for (const l of [...a, ...(b ?? [])])
    total.set(l.typeId, (total.get(l.typeId) ?? 0) + l.quantity);
  return [...total]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .filter((l) => l.quantity > 0)
    .sort((x, y) => x.typeId - y.typeId);
}

/** A stored `{ typeId: price }` record as the Map `computeAssignmentValue` reads. */
export function priceMap(unitPrices: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(unitPrices).map(([typeId, price]) => [Number(typeId), price]));
}
