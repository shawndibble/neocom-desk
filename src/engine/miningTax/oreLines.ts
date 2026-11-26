import type { OreLine } from './types';

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

export function addLines(a: readonly OreLine[], b: readonly OreLine[] | undefined): OreLine[] {
  const total = new Map<number, number>();
  for (const l of [...a, ...(b ?? [])])
    total.set(l.typeId, (total.get(l.typeId) ?? 0) + l.quantity);
  return [...total]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .filter((l) => l.quantity > 0)
    .sort((x, y) => x.typeId - y.typeId);
}

export function priceMap(unitPrices: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(unitPrices).map(([typeId, price]) => [Number(typeId), price]));
}

export function sameLines(a: readonly OreLine[], b: readonly OreLine[]): boolean {
  const x = addLines(a, []);
  const y = addLines(b, []);
  return (
    x.length === y.length &&
    x.every((l, i) => l.typeId === y[i]!.typeId && l.quantity === y[i]!.quantity)
  );
}
